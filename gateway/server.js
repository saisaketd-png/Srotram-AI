const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const { createDeepgramSession, DEEPGRAM_API_KEY } = require('./transcription');

const PORT = process.env.GATEWAY_PORT || 4000;
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const SLIDING_WINDOW_SIZE = 6; // Keep 1.5s of context for the neural model
const MIN_CHUNKS_FOR_ANALYSIS = 1; // Start analyzing immediately

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true },
  maxHttpBufferSize: 5e6,
  pingTimeout: 60000
});

// Challenge phrases - natural conversation starters anyone would say on a call
const CHALLENGE_PHRASES = [
  "Can you tell me what's the best way to reach you if we get disconnected?",
  "Just to confirm, what's your name and which department are you calling from?",
  "Could you repeat the last four digits of the account number you mentioned?",
  "What's a good time for me to call you back if needed?",
  "Can you spell out your full name for me, please?",
  "Which city are you calling from right now?",
  "What's the reference number for this call?",
  "Can you confirm the email address you have on file for this account?",
  "What was the last transaction amount you're referring to?",
  "Could you tell me the name of the company you're representing?"
];

// Session store
const sessions = new Map();

function float32BufferToInt16Buffer(bufferLike) {
  const input = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike);
  const sampleCount = Math.floor(input.length / 4);
  const view = new Float32Array(input.buffer, input.byteOffset, sampleCount);
  const out = Buffer.allocUnsafe(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const clamped = Math.max(-1, Math.min(1, view[i]));
    out.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return out;
}

function createSession(id) {
  const s = {
    id,
    createdAt: Date.now(),
    audioBuffer: [],
    chunkCount: 0,
    totalBytes: 0,
    lastScore: null,
    isAnalyzing: false,
    challengeActive: false,
    challengePhrase: null,
    challengeTs: null,
    demoState: 0,
    sampleRate: 16000,
    transcriptText: '',
    transcriptUpdatedAt: 0,
    challengeLatencyMs: null
  };
  sessions.set(id, s);
  return s;
}

app.get('/health', (req, res) => res.json({ status: 'operational', service: 'Srotram AI Gateway', connections: io.engine.clientsCount }));

app.get('/api/ai-health', async (req, res) => {
  try { const r = await axios.get(`${AI_ENGINE_URL}/health`, { timeout: 3000 }); res.json(r.data); }
  catch { res.json({ status: 'offline', gpu: null }); }
});

app.get('/api/stats', (req, res) => res.json({ activeSessions: sessions.size }));

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);
  const session = createSession(socket.id);
  socket.emit('gateway:connected', { sessionId: socket.id, config: { chunkDuration: 250, slidingWindow: SLIDING_WINDOW_SIZE, sampleRate: 16000 } });

  // Start Deepgram transcription session if API key is configured
  let dgSession = null;
  if (DEEPGRAM_API_KEY) {
    console.log('[DEEPGRAM] API key found — transcription enabled');
    socket.emit('transcript:status', { provider: 'deepgram', status: 'connecting' });
    dgSession = createDeepgramSession(
      48000, // will be updated on first chunk
      (evt) => {
        if (evt.text) {
          session.transcriptText = evt.text;
          session.transcriptUpdatedAt = Date.now();
          socket.emit('transcript:result', {
            text:    evt.text,
            isFinal: evt.isFinal,
            words:   evt.words || []
          });
        }
      },
      (err) => {
        socket.emit('transcript:status', { provider: 'deepgram', status: 'error', message: err });
      }
    );
    if (dgSession) socket.emit('transcript:status', { provider: 'deepgram', status: 'ready' });
  } else {
    console.log('[DEEPGRAM] No API key — transcription uses browser Web Speech API');
    socket.emit('transcript:status', { provider: 'browser', status: 'ready' });
  }

  socket.on('audio:chunk', async (data) => {
    const { chunk, sampleRate } = data;
    if (!chunk) return;

    // Socket.io may deliver chunk as Buffer, Uint8Array, or ArrayBuffer
    let chunkBuffer;
    if (Buffer.isBuffer(chunk)) {
      chunkBuffer = chunk;
    } else if (chunk instanceof Uint8Array) {
      chunkBuffer = Buffer.from(chunk);
    } else if (chunk.buffer instanceof ArrayBuffer) {
      chunkBuffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    } else {
      chunkBuffer = Buffer.from(chunk);
    }

    if (chunkBuffer.length < 4) return; // Too small to be valid audio

    session.audioBuffer.push(chunkBuffer);
    session.chunkCount++;
    session.totalBytes += chunkBuffer.length;
    if (sampleRate) session.sampleRate = sampleRate;
    if (session.audioBuffer.length > SLIDING_WINDOW_SIZE) session.audioBuffer.shift();

    socket.emit('audio:chunk_ack', {
      chunkIndex: session.chunkCount,
      bufferSize: session.audioBuffer.length,
      bytesReceived: session.totalBytes
    });

    console.log(`[CHUNK] #${session.chunkCount} | ${chunkBuffer.length} bytes | sr=${session.sampleRate}`);

    // Forward chunk to Deepgram for transcription (runs in parallel with AI analysis)
    if (dgSession) dgSession.send(chunkBuffer);

    // Analyze every chunk (was every 2 — now real-time)
    if (!session.isAnalyzing) {
      session.isAnalyzing = true;
      try {
        const t0 = Date.now();
        const bufFloat32 = Buffer.concat(session.audioBuffer.map(c => Buffer.from(c)));
        const bufInt16 = float32BufferToInt16Buffer(bufFloat32);

        // Wait until we have at least 3 chunks (1.5 seconds) of audio
        // Otherwise, the physical bass heuristic panics and thinks a short breath is an AI phone speaker!
        if (session.audioBuffer.length < 3) {
          session.isAnalyzing = false;
          return;
        }

        const resp = await axios.post(`${AI_ENGINE_URL}/analyze`, bufInt16, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Sample-Rate': String(session.sampleRate),
            'X-Session-Id': socket.id,
            'X-Transcript': session.transcriptText || '',
            'X-Challenge-Latency-Ms': session.challengeLatencyMs != null ? String(session.challengeLatencyMs) : ''
          },
          responseType: 'json',
          timeout: 20000
        });

        const result = {
          ...resp.data,
          latency_ms: Date.now() - t0,
          chunk_index: session.chunkCount,
          timestamp: Date.now()
        };
        session.lastScore = result.risk_score;
        socket.emit('analysis:result', result);

        if (result.risk_score >= 75) {
          socket.emit('analysis:alert', {
            level: result.risk_score >= 90 ? 'critical' : 'high',
            message: result.xai_report || 'High fraud risk detected',
            score: result.risk_score
          });
        }

        console.log(`[ANALYSIS] Score: ${result.risk_score}% | ${Date.now() - t0}ms`);
      } catch (err) {
        console.error('[AI ENGINE ERROR]', err.message);
        socket.emit('analysis:error', { message: 'AI Engine failed: ' + err.message });
      } finally {
        session.isAnalyzing = false;
      }
    }
  });

  socket.on('demo:analyze_file', async (data) => {
    try {
      const resp = await axios.post(`${AI_ENGINE_URL}/analyze`, Buffer.from(data.audioData), {
        headers: { 
          'Content-Type': 'application/octet-stream', 
          'X-Sample-Rate': '16000', 
          'X-Session-Id': socket.id, 
          'X-Demo-Mode': '0', 
          'X-Upload-Source': 'file',
          'X-File-Name': data.fileName || 'unknown'
        },
        responseType: 'json', timeout: 10000
      });
      socket.emit('analysis:result', { ...resp.data, fileName: data.fileName });
    } catch (err) { socket.emit('analysis:error', { message: `Analysis failed: ${data.fileName}` }); }
  });

  socket.on('challenge:generate', () => {
    const phrase = CHALLENGE_PHRASES[Math.floor(Math.random() * CHALLENGE_PHRASES.length)];
    session.challengeActive = true;
    session.challengePhrase = phrase;
    session.challengeTs = Date.now();
    socket.emit('challenge:phrase', { phrase, timestamp: session.challengeTs });
  });

  socket.on('challenge:response_received', () => {
    if (session.challengeActive) {
      const lat = Date.now() - session.challengeTs;
      session.challengeActive = false;
      session.challengeLatencyMs = lat;
      // Human reaction (1s) + reading out loud (3-4s) = ~4000-5000ms
      // AI processing delay adds an additional 2-5 seconds
      const assessment = lat < 5000 ? 'natural' : lat < 8000 ? 'suspicious' : 'likely_synthetic';
      socket.emit('challenge:result', { latency_ms: lat, phrase: session.challengePhrase, assessment });
    }
  });

  socket.on('telemetry:request', async () => {
    try { const r = await axios.get(`${AI_ENGINE_URL}/telemetry`, { timeout: 2000 }); socket.emit('telemetry:data', r.data); }
    catch {
      socket.emit('telemetry:data', {
        gpu: { name: 'CPU', active: false, vram_used_gb: 0, vram_total_gb: 0, utilization_pct: 0 },
        status: 'offline',
        latest: { risk_score: 0, inference_ms: 0, latency_ms: 0 }
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] ${socket.id}: ${reason}`);
    if (dgSession) { dgSession.close(); dgSession = null; }
    sessions.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`\n  ⚡ Srotram AI Gateway ONLINE — Port ${PORT}\n  AI Engine: ${AI_ENGINE_URL}\n  Sliding Window: ${SLIDING_WINDOW_SIZE} chunks (1500ms @ 250ms chunks)\n`);
});

module.exports = { app, server, io };
