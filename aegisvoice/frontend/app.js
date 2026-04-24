/* ═══════════════════════════════════════════════
   AegisVoice — Frontend Logic (No Build Tools)
   ═══════════════════════════════════════════════ */

const GATEWAY = 'http://localhost:4000';
let socket = null, isRecording = false, demoMode = false;
let mediaRecorder = null, audioStream = null, audioCtx = null, analyser = null, animFrame = null;
let challengeWaiting = false, challengeStart = 0, challengeInterval = null;
let feedEntries = [], sparkData = Array(20).fill(0);

// ─── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initSpectroBars();
  initSparkline();
  initPrivacyFlows();
  connectSocket();
  switchTab('monitor');
  setInterval(pollTelemetry, 3000);
});

// ─── Socket.io ─────────────────────────────────
function connectSocket() {
  socket = io(GATEWAY, { transports: ['websocket'], reconnection: true });
  socket.on('connect', () => updateConnStatus(true));
  socket.on('disconnect', () => updateConnStatus(false));
  socket.on('gateway:connected', d => { document.getElementById('statSession').textContent = d.sessionId.slice(0, 8); });
  socket.on('analysis:result', handleAnalysis);
  socket.on('analysis:alert', handleAlert);
  socket.on('analysis:error', d => addFeedEntry('warning', `Error: ${d.message}`));
  socket.on('audio:chunk_ack', handleChunkAck);
  socket.on('telemetry:data', handleTelemetry);
  socket.on('challenge:phrase', handleChallengePhrase);
  socket.on('challenge:result', handleChallengeResult);
  socket.on('demo:status', d => { demoMode = d.enabled; document.getElementById('demoBtn').classList.toggle('active', demoMode); document.getElementById('demoBtn').textContent = demoMode ? '🎭 DEMO ON' : 'DEMO'; });
}

function updateConnStatus(connected) {
  const el = document.getElementById('connStatus');
  el.innerHTML = `<span class="dot ${connected ? 'dot-green' : 'dot-red'}"></span><span>${connected ? 'CONNECTED' : 'DISCONNECTED'}</span>`;
}

// ─── Recording ─────────────────────────────────
async function toggleRecording() {
  if (isRecording) { stopRecording(); } else { await startRecording(); }
}

async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(audioStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    updateAudioLevel();

    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) e.data.arrayBuffer().then(buf => socket.emit('audio:chunk', { chunk: buf, sampleRate: 16000, timestamp: Date.now() })); };
    mediaRecorder.start(500);
    isRecording = true;
    const btn = document.getElementById('recordBtn');
    btn.textContent = '⏹ Stop'; btn.classList.add('recording');
    document.getElementById('spectroStatus').textContent = 'LIVE';
    addFeedEntry('ok', 'Audio capture started — streaming 500ms chunks');
  } catch (err) { addFeedEntry('warning', 'Microphone access denied: ' + err.message); }
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  audioStream?.getTracks().forEach(t => t.stop());
  if (animFrame) cancelAnimationFrame(animFrame);
  isRecording = false;
  const btn = document.getElementById('recordBtn');
  btn.textContent = '🎙 Analyze'; btn.classList.remove('recording');
  document.getElementById('spectroStatus').textContent = 'IDLE';
  document.getElementById('audioLevelBar').style.width = '0';
  document.getElementById('audioLevelVal').textContent = '0%';
  addFeedEntry('ok', 'Audio capture stopped');
}

function updateAudioLevel() {
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
  document.getElementById('audioLevelBar').style.width = (avg * 100) + '%';
  document.getElementById('audioLevelVal').textContent = Math.round(avg * 100) + '%';
  updateSpectroBars(data);
  animFrame = requestAnimationFrame(updateAudioLevel);
}

// ─── Analysis Handler ──────────────────────────
function handleAnalysis(d) {
  const risk = d.risk_score || 0;
  updateShield(risk, d.acoustic_score || 0, d.behavioral_score || 0, d.nlp_score || 0, d.network_score || 0);
  updateXAI(d);
  updateEmotion(d.emotion);

  if (d.acoustic_artifacts?.length) addFeedEntry('warning', `Acoustic: ${d.acoustic_artifacts.join(', ')}`);
  if (d.behavioral_flags?.length) addFeedEntry('anomaly', `Behavioral: ${d.behavioral_flags.join(', ')}`);
  if (d.nlp_flags?.length) addFeedEntry('scam', `Scam indicators: ${d.nlp_flags.join(', ')}`);
  if (d.nlp_phrases?.length) addFeedEntry('nlp', `Flagged: "${d.nlp_phrases[0]}"`);
  if (d.emotion?.is_flat) addFeedEntry('emotion', 'Emotional flatness — possible AI speech');
  if (d.network_protocol === 'VoIP/SIP') addFeedEntry('network', `VoIP detected (jitter: ${d.network_jitter}ms)`);
  if (!d.acoustic_artifacts?.length && !d.behavioral_flags?.length && !d.nlp_flags?.length) addFeedEntry('ok', 'No anomalies in this window');

  if (d.latency_ms) { sparkData.push(d.latency_ms); sparkData.shift(); updateSparkline(); document.getElementById('latencyVal').textContent = d.latency_ms + 'ms'; }
}

function handleAlert(d) {
  addFeedEntry('alert', `⚠ ALERT: ${d.message} [Score: ${d.score}%]`);
}

function handleChunkAck(d) {
  document.getElementById('statChunks').textContent = d.chunkIndex;
  document.getElementById('statBuffer').textContent = d.bufferSize;
  document.getElementById('statBytes').textContent = (d.bytesReceived / 1024).toFixed(1);
}

// ─── Shield ────────────────────────────────────
function getColor(v) { return v < 30 ? 'var(--green)' : v < 60 ? 'var(--amber)' : 'var(--red)'; }
function getColorHex(v) { return v < 30 ? '#22c55e' : v < 60 ? '#f59e0b' : '#ef4444'; }

function updateShield(risk, ac, bh, nlp, net) {
  const circ = 2 * Math.PI * 90;
  const offset = circ - (risk / 100) * circ;
  const ring = document.getElementById('shieldRing');
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = getColorHex(risk);
  ring.style.filter = `drop-shadow(0 0 8px ${getColorHex(risk)})`;
  document.querySelector('.shield-outer').style.stroke = getColorHex(risk);

  const scoreEl = document.getElementById('riskScore');
  scoreEl.textContent = Math.round(risk);
  scoreEl.style.color = getColorHex(risk);
  scoreEl.style.textShadow = `0 0 12px ${getColorHex(risk)}60`;

  const panel = document.getElementById('shieldPanel');
  panel.className = `panel ${risk < 30 ? 'glow-green' : risk < 60 ? 'glow-amber' : 'glow-red'}`;

  updateBar('Acoustic', ac); updateBar('Behavioral', bh); updateBar('Nlp', nlp); updateBar('Network', net);
}

function updateBar(name, val) {
  const bar = document.getElementById('bar' + name);
  const label = document.getElementById('val' + name);
  bar.style.width = val + '%';
  bar.style.background = getColorHex(val);
  label.textContent = Math.round(val) + '%';
  label.style.color = getColorHex(val);
}

// ─── Spectrogram Bars ──────────────────────────
function initSpectroBars() {
  const cont = document.getElementById('spectroBars');
  for (let i = 0; i < 64; i++) { const b = document.createElement('div'); b.className = 'spectro-bar'; b.style.height = '4px'; cont.appendChild(b); }
}

function updateSpectroBars(data) {
  const bars = document.querySelectorAll('.spectro-bar');
  const risk = parseFloat(document.getElementById('riskScore').textContent) || 0;
  const color = risk < 30 ? 'rgba(34,197,94,' : risk < 60 ? 'rgba(245,158,11,' : 'rgba(239,68,68,';
  const step = Math.floor(data.length / bars.length);
  bars.forEach((b, i) => {
    const v = data[i * step] || 0;
    const h = Math.max(4, (v / 255) * 86);
    b.style.height = h + 'px';
    b.style.background = color + (0.3 + (v / 255) * 0.7) + ')';
  });
}

// ─── Intel Feed ────────────────────────────────
function addFeedEntry(type, text) {
  const feed = document.getElementById('intelFeed');
  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `feed-entry feed-${type}`;
  const icons = { ok: '✓', warning: '⚡', anomaly: '🧠', scam: '🚨', nlp: '💬', emotion: '😶', network: '📡', alert: '🔴' };
  div.innerHTML = `<div>${icons[type] || '•'} ${text}</div><div class="fe-time">${new Date().toLocaleTimeString()}</div>`;
  feed.insertBefore(div, feed.firstChild);

  feedEntries.unshift({ type, text });
  if (feedEntries.length > 50) { feedEntries.pop(); if (feed.lastChild) feed.removeChild(feed.lastChild); }
  document.getElementById('eventCount').textContent = feedEntries.length + ' events';
}

// ─── XAI ───────────────────────────────────────
function updateXAI(d) {
  document.getElementById('xaiText').textContent = d.xai_report || 'No significant anomalies.';
  document.getElementById('xaiMeta').textContent = d.inference_ms ? `Inference: ${d.inference_ms}ms | Audio: ${d.audio_bytes} bytes | Model: ${d.model_version}` : '';
}

// ─── Emotion ───────────────────────────────────
const EMOJIS = { neutral: '😐', anxious: '😰', calm: '😌', aggressive: '😠', fearful: '😨', flat: '😶' };
const ECOLORS = { neutral: '#64748b', anxious: '#f59e0b', calm: '#22c55e', aggressive: '#ef4444', fearful: '#a855f7', flat: '#6b7280' };

function updateEmotion(e) {
  if (!e) return;
  const c = ECOLORS[e.current] || '#64748b';
  document.getElementById('emotionIcon').textContent = EMOJIS[e.current] || '😐';
  document.getElementById('emotionIcon').style.borderColor = c;
  document.getElementById('emotionIcon').style.boxShadow = `0 0 12px ${c}40`;
  document.getElementById('emotionLabel').textContent = e.current;
  document.getElementById('emotionLabel').style.color = c;
  document.getElementById('emotionDrift').textContent = `Drift: ${Math.round(e.drift_score || 0)}%`;

  const badge = document.getElementById('flatBadge');
  badge.classList.toggle('hidden', !e.is_flat);

  const hist = document.getElementById('emotionHistory');
  hist.innerHTML = '<span class="eh-label">History:</span>';
  (e.history || []).forEach(h => {
    const chip = document.createElement('div');
    chip.className = 'emotion-chip';
    chip.style.borderColor = (ECOLORS[h] || '#64748b') + '50';
    chip.style.background = (ECOLORS[h] || '#64748b') + '15';
    chip.textContent = EMOJIS[h] || '😐';
    chip.title = h;
    hist.appendChild(chip);
  });
}

// ─── Challenge ─────────────────────────────────
function generateChallenge() {
  socket.emit('challenge:generate');
  challengeWaiting = true; challengeStart = Date.now();
  document.getElementById('genPhraseBtn').classList.add('hidden');
  document.getElementById('respondBtn').classList.remove('hidden');
  document.getElementById('challengeTimer').classList.remove('hidden');
  document.getElementById('challengeResult').classList.add('hidden');
  challengeInterval = setInterval(() => { document.getElementById('challengeTimer').textContent = ((Date.now() - challengeStart) / 1000).toFixed(1) + 's'; }, 50);
}

function handleChallengePhrase(d) {
  document.getElementById('challengePhrase').classList.remove('hidden');
  document.getElementById('phraseText').textContent = '"' + d.phrase + '"';
}

function submitResponse() {
  socket.emit('challenge:response_received');
  challengeWaiting = false;
  clearInterval(challengeInterval);
  document.getElementById('challengeTimer').classList.add('hidden');
  document.getElementById('respondBtn').classList.add('hidden');
  document.getElementById('genPhraseBtn').classList.remove('hidden');
}

function handleChallengeResult(d) {
  const el = document.getElementById('challengeResult');
  el.classList.remove('hidden');
  const colors = { natural: 'var(--green)', suspicious: 'var(--amber)', likely_synthetic: 'var(--red)' };
  const labels = { natural: '✅ Natural', suspicious: '⚠️ Suspicious', likely_synthetic: '🚨 Likely AI' };
  const descs = { natural: 'Response time consistent with human speech', suspicious: 'Elevated latency — possible processing delay', likely_synthetic: 'High latency strongly suggests AI-generated response' };
  el.style.borderColor = (colors[d.assessment] || 'var(--muted)') + '60';
  el.style.background = (colors[d.assessment] || 'var(--muted)').replace('var(', '').replace(')', '') ? `rgba(0,0,0,0.1)` : '';
  document.getElementById('crAssessment').textContent = labels[d.assessment] || d.assessment;
  document.getElementById('crAssessment').style.color = colors[d.assessment] || 'var(--muted)';
  document.getElementById('crLatency').textContent = d.latency_ms + 'ms';
  document.getElementById('crDesc').textContent = descs[d.assessment] || '';
}

// ─── Telemetry ─────────────────────────────────
function pollTelemetry() { if (socket?.connected) socket.emit('telemetry:request'); }

function handleTelemetry(d) {
  const gpu = d.gpu || {};
  const online = d.status === 'operational';
  document.getElementById('gpuStatus').innerHTML = `<span class="dot ${online ? 'dot-green' : 'dot-red'}"></span><span>${online ? 'GPU ONLINE' : 'OFFLINE'}</span>`;
  document.getElementById('gpuName').textContent = gpu.name || 'RTX 3040';
  const vramPct = gpu.vram_total ? Math.round((gpu.vram_used / gpu.vram_total) * 100) : 0;
  document.getElementById('gpuVram').textContent = vramPct + '%';
  document.getElementById('gpuUtil').textContent = (gpu.utilization || 0) + '%';
  document.getElementById('gpuTemp').textContent = (gpu.temperature || '--') + '°C';
  document.getElementById('inferenceCount').textContent = (d.inference_count || 0) + ' inferences';
}

// ─── Sparkline ─────────────────────────────────
function initSparkline() {
  const cont = document.getElementById('sparkline');
  for (let i = 0; i < 20; i++) { const b = document.createElement('div'); b.className = 'spark-bar'; b.style.height = '2px'; b.style.background = 'var(--green)'; cont.appendChild(b); }
}

function updateSparkline() {
  const bars = document.querySelectorAll('.spark-bar');
  const max = Math.max(...sparkData, 1);
  bars.forEach((b, i) => {
    const v = sparkData[i];
    b.style.height = Math.max(2, (v / max) * 24) + 'px';
    b.style.background = v < 200 ? 'var(--green)' : v < 300 ? 'var(--amber)' : 'var(--red)';
  });
}

// ─── Privacy Flows ─────────────────────────────
function initPrivacyFlows() {
  const flows = [
    { from: 'Microphone', to: 'Browser (MediaRecorder)', ok: true },
    { from: 'Browser', to: 'Gateway (localhost:4000)', ok: true },
    { from: 'Gateway', to: 'AI Engine (localhost:8000)', ok: true },
    { from: 'AI Engine', to: 'RTX 3040 GPU (CUDA)', ok: true },
    { from: 'External APIs', to: 'NONE', ok: false, blocked: true }
  ];
  const cont = document.getElementById('dataFlows');
  flows.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'data-flow';
    div.style.animationDelay = (i * 0.1) + 's';
    div.innerHTML = `<span class="dot ${f.ok ? 'dot-green' : 'dot-red'}" style="width:6px;height:6px"></span><span style="color:var(--text)">${f.from}</span><span style="color:var(--muted)">${f.blocked ? '✕' : '→'}</span><span style="color:${f.ok ? 'var(--green)' : 'var(--red)'}">${f.to}</span>${f.blocked ? '<span class="df-blocked">BLOCKED</span>' : ''}`;
    cont.appendChild(div);
  });
}

// ─── Tabs ──────────────────────────────────────
function switchTab(tab) {
  document.getElementById('monitorTab').classList.toggle('hidden', tab !== 'monitor');
  document.getElementById('privacyTab').classList.toggle('hidden', tab !== 'privacy');
  document.getElementById('tabMonitor').classList.toggle('active', tab === 'monitor');
  document.getElementById('tabPrivacy').classList.toggle('active', tab === 'privacy');
}

// ─── Demo Mode ─────────────────────────────────
function toggleDemo() { socket.emit('demo:toggle', { enabled: !demoMode }); }
