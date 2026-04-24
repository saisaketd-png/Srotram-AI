const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const PORT = process.env.GATEWAY_PORT || 4000;
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const SLIDING_WINDOW_SIZE = 4;

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true },
  maxHttpBufferSize: 5e6,
  pingTimeout: 60000
});

// Challenge phrases for verification
const PHRASES = [
  "The purple elephant danced on the rooftop at midnight",
  "Seven crystalline dolphins swim through quantum foam",
  "Beyond the tessellated meadow lies the sonic waterfall",
  "The holographic penguin recites fibonacci poetry",
  "Three geometric ravens decode the amber algorithm"
];

// Session store
const sessions = new Map();

function createSession(id) {
  const s = { id, createdAt: Date.now(), audioBuffer: [], chunkCount: 0, totalBytes: 0, lastScore: null, isAnalyzing: false, challengeActive: false, challengePhrase: null, challengeTs: null, isDemoMode: false, sampleRate: 16000 };
  sessions.set(id, s);
  return s;
}

app.get('/health', (req, res) => res.json({ status: 'operational', service: 'AegisVoice Gateway', connections: io.engine.clientsCount }));

app.get('/api/ai-health', async (req, res) => {
  try { const r = await axios.get(`${AI_ENGINE_URL}/health`, { timeout: 3000 }); res.json(r.data); }
  catch { res.json({ status: 'offline', gpu: null }); }
});

app.get('/api/stats', (req, res) => res.json({ activeSessions: sessions.size }));

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);
  const session = createSession(socket.id);
  socket.emit('gateway:connected', { sessionId: socket.id, config: { chunkDuration: 500, slidingWindow: SLIDING_WINDOW_SIZE, sampleRate: 16000 } });

  socket.on('audio:chunk', async (data) => {
    const { chunk, sampleRate } = data;
    if (!chunk) return;
    session.audioBuffer.push(chunk);
    session.chunkCount++;
    session.totalBytes += chunk.byteLength || chunk.length || 0;
    if (sampleRate) session.sampleRate = sampleRate;
    if (session.audioBuffer.length > SLIDING_WINDOW_SIZE) session.audioBuffer.shift();
    socket.emit('audio:chunk_ack', { chunkIndex: session.chunkCount, bufferSize: session.audioBuffer.length, bytesReceived: session.totalBytes });

    if (session.audioBuffer.length >= SLIDING_WINDOW_SIZE && !session.isAnalyzing) {
      session.isAnalyzing = true;
      try {
        const t0 = Date.now();
        const buf = Buffer.concat(session.audioBuffer.map(c => Buffer.from(c)));
        const resp = await axios.post(`${AI_ENGINE_URL}/analyze`, buf, {
          headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(session.sampleRate), 'X-Session-Id': socket.id, 'X-Demo-Mode': String(session.isDemoMode) },
          responseType: 'json', timeout: 5000
        });
        const result = { ...resp.data, latency_ms: Date.now() - t0, chunk_index: session.chunkCount, timestamp: Date.now() };
        session.lastScore = result.risk_score;
        socket.emit('analysis:result', result);
        if (result.risk_score >= 75) socket.emit('analysis:alert', { level: result.risk_score >= 90 ? 'critical' : 'high', message: result.xai_report || 'High fraud risk', score: result.risk_score });
        console.log(`[ANALYSIS] ${socket.id} | Score: ${result.risk_score}% | ${Date.now() - t0}ms`);
      } catch (err) {
        socket.emit('analysis:error', { message: 'AI Engine failed', error: err.message });
      } finally { session.isAnalyzing = false; }
    }
  });

  socket.on('demo:toggle', (d) => { session.isDemoMode = d.enabled; socket.emit('demo:status', { enabled: d.enabled }); });

  socket.on('demo:analyze_file', async (data) => {
    try {
      const resp = await axios.post(`${AI_ENGINE_URL}/analyze`, Buffer.from(data.audioData), {
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '16000', 'X-Session-Id': socket.id, 'X-Demo-Mode': 'true' },
        responseType: 'json', timeout: 10000
      });
      socket.emit('analysis:result', { ...resp.data, demo: true, fileName: data.fileName });
    } catch (err) { socket.emit('analysis:error', { message: `Demo failed: ${data.fileName}` }); }
  });

  socket.on('challenge:generate', () => {
    const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
    session.challengeActive = true;
    session.challengePhrase = phrase;
    session.challengeTs = Date.now();
    socket.emit('challenge:phrase', { phrase, timestamp: session.challengeTs });
  });

  socket.on('challenge:response_received', () => {
    if (session.challengeActive) {
      const lat = Date.now() - session.challengeTs;
      session.challengeActive = false;
      socket.emit('challenge:result', { latency_ms: lat, phrase: session.challengePhrase, assessment: lat < 800 ? 'natural' : lat < 1500 ? 'suspicious' : 'likely_synthetic' });
    }
  });

  socket.on('telemetry:request', async () => {
    try { const r = await axios.get(`${AI_ENGINE_URL}/telemetry`, { timeout: 2000 }); socket.emit('telemetry:data', r.data); }
    catch { socket.emit('telemetry:data', { gpu: { name: 'RTX 3040', vram_used: 0, vram_total: 0 }, status: 'offline' }); }
  });

  socket.on('disconnect', (reason) => { console.log(`[DISCONNECT] ${socket.id}: ${reason}`); sessions.delete(socket.id); });
});

server.listen(PORT, () => {
  console.log(`\n  ⚡ AegisVoice Gateway ONLINE — Port ${PORT}\n  AI Engine: ${AI_ENGINE_URL}\n  Sliding Window: ${SLIDING_WINDOW_SIZE} chunks (2000ms)\n`);
});

module.exports = { app, server, io };
