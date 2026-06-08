/**
 * transcription.js — Deepgram real-time streaming transcription
 * Plugs into server.js per-session; receives raw Float32 PCM chunks
 * from the browser and streams them to Deepgram's WebSocket API.
 *
 * API Key: set DEEPGRAM_API_KEY in environment or .env file
 * Get a free key at: https://console.deepgram.com (250 free hours/month)
 */

const WebSocket = require('ws');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const DEEPGRAM_URL     = 'wss://api.deepgram.com/v1/listen';

/**
 * float32ToInt16 — converts Float32Array PCM to Int16 Buffer
 * Deepgram expects linear16 PCM, not Float32.
 */
function float32ToInt16(buffer) {
  const rawBytes  = buffer;                        // Buffer of raw bytes
  const f32count  = rawBytes.length / 4;           // how many float32 values
  const f32view   = new Float32Array(rawBytes.buffer, rawBytes.byteOffset, f32count);
  const i16buf    = Buffer.allocUnsafe(f32count * 2);
  for (let i = 0; i < f32count; i++) {
    const s = Math.max(-1, Math.min(1, f32view[i]));
    i16buf.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return i16buf;
}

/**
 * createDeepgramSession — opens a Deepgram WebSocket for one browser session.
 *
 * @param {number}   sampleRate  - native sample rate from browser (44100/48000)
 * @param {Function} onTranscript  - called with { text, isFinal, words }
 * @param {Function} onError       - called with error string
 * @returns {{ send(chunkBuffer), close() }}
 */
function createDeepgramSession(sampleRate, onTranscript, onError) {
  if (!DEEPGRAM_API_KEY) {
    onError('DEEPGRAM_API_KEY not set. Add it to your environment variables.');
    return null;
  }

  const params = new URLSearchParams({
    model:         'nova-2',          // best accuracy model
    language:      'en-US',
    encoding:      'linear16',        // Int16 PCM
    sample_rate:   String(sampleRate),
    channels:      '1',
    punctuate:     'true',
    smart_format:  'true',
    interim_results: 'true',          // get live partial results
    utterance_end_ms: '1000',
    vad_events:    'true',
  });

  const url = `${DEEPGRAM_URL}?${params.toString()}`;
  const ws  = new WebSocket(url, { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } });

  ws.on('open', () => console.log('[DEEPGRAM] Connected'));
  ws.on('error', e => { console.error('[DEEPGRAM ERR]', e.message); onError(e.message); });
  ws.on('close', (code, reason) => console.log(`[DEEPGRAM] Closed ${code} ${reason}`));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'Results') {
        const alt   = msg.channel?.alternatives?.[0];
        if (!alt) return;
        const text  = alt.transcript?.trim();
        if (!text)  return;
        onTranscript({
          text,
          isFinal: msg.is_final,
          words:   alt.words || []
        });
      } else if (msg.type === 'SpeechStarted') {
        onTranscript({ text: '', isFinal: false, speechStarted: true });
      } else if (msg.type === 'UtteranceEnd') {
        onTranscript({ text: '', isFinal: true, utteranceEnd: true });
      }
    } catch { /* ignore parse errors */ }
  });

  return {
    send(chunkBuffer) {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        const i16 = float32ToInt16(chunkBuffer);
        ws.send(i16);
      } catch (e) {
        console.error('[DEEPGRAM] Send error:', e.message);
      }
    },
    close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  };
}

module.exports = { createDeepgramSession, DEEPGRAM_API_KEY };
