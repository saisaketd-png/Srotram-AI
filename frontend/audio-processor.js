/**
 * audio-processor.js — AudioWorklet processor for AegisVoice
 * Must be served from the same origin as the page (handled by serve-frontend.js).
 *
 * Accumulates raw Float32 samples from the microphone into chunks of
 * configurable size, then posts them to the main thread via MessagePort.
 * AudioWorklet is the modern replacement for ScriptProcessor and is
 * far more reliable for raw PCM capture on Windows.
 */
class AegisAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // chunkSamples: how many samples to buffer before sending
    // Default 4800 = 100ms at 48kHz (server expects 500ms chunks, we batch in JS)
    this._chunkSamples = (options.processorOptions && options.processorOptions.chunkSamples) || 4800;
    this._buf = new Float32Array(this._chunkSamples);
    this._pos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0]; // Float32Array, usually 128 samples per call

    for (let i = 0; i < channel.length; i++) {
      this._buf[this._pos++] = channel[i];

      if (this._pos >= this._chunkSamples) {
        // Send a COPY of the buffer (transferable for zero-copy)
        const out = this._buf.buffer.slice(0);
        this.port.postMessage({ pcm: out }, [out]);
        this._buf = new Float32Array(this._chunkSamples);
        this._pos = 0;
      }
    }
    return true; // keep alive
  }
}

registerProcessor('aegis-audio-processor', AegisAudioProcessor);
