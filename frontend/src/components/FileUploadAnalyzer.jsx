import { useState } from 'react';
import { motion } from 'framer-motion';

const TARGET_SAMPLE_RATE = 16000;

async function decodeToMono16kArrayBuffer(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelData = decoded.numberOfChannels === 1
      ? decoded.getChannelData(0)
      : (() => {
          const left = decoded.getChannelData(0);
          const right = decoded.getChannelData(1);
          const mono = new Float32Array(decoded.length);
          for (let i = 0; i < decoded.length; i++) {
            mono[i] = (left[i] + right[i]) * 0.5;
          }
          return mono;
        })();

    if (decoded.sampleRate === TARGET_SAMPLE_RATE) {
      return channelData.buffer.slice(channelData.byteOffset, channelData.byteOffset + channelData.byteLength);
    }

    const outLen = Math.floor(channelData.length * TARGET_SAMPLE_RATE / decoded.sampleRate);
    const resampled = new Float32Array(outLen);
    const ratio = decoded.sampleRate / TARGET_SAMPLE_RATE;
    for (let i = 0; i < outLen; i++) {
      const srcIndex = i * ratio;
      const lo = Math.floor(srcIndex);
      const hi = Math.min(channelData.length - 1, lo + 1);
      const frac = srcIndex - lo;
      resampled[i] = channelData[lo] * (1 - frac) + channelData[hi] * frac;
    }
    return resampled.buffer;
  } finally {
    await audioContext.close();
  }
}

export default function FileUploadAnalyzer({ onAnalyzeFile, latestResult }) {
  const [selectedName, setSelectedName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const verdictRisk = Number(latestResult?.risk_score || 0);
  const verdict = verdictRisk >= 50 ? 'AI DEEPFAKE' : 'REAL VOICE';
  const verdictColor = verdictRisk >= 50 ? 'text-srotram-red border-srotram-red/40 bg-srotram-red/10' : 'text-srotram-green border-srotram-green/40 bg-srotram-green/10';

  const onFilePick = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setSelectedName(file.name);
    setIsProcessing(true);
    try {
      const pcmBuffer = await decodeToMono16kArrayBuffer(file);
      onAnalyzeFile(pcmBuffer, file.name, file.type || 'audio/*');
    } catch (e) {
      setError(`Could not decode audio file: ${e.message}`);
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  return (
    <motion.div
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
    >
      <h2 className="text-sm font-semibold text-srotram-muted uppercase tracking-wider mb-2">
        Upload Audio Analysis
      </h2>
      <p className="text-[11px] text-srotram-muted mb-3">
        Upload `.wav`, `.mp3`, or `.m4a`. Srotram converts to 16kHz mono and returns a final verdict.
      </p>

      <label className="block">
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={onFilePick}
          disabled={isProcessing}
        />
        <span className="block w-full py-2 px-3 rounded-lg border border-srotram-border text-center text-xs font-semibold text-srotram-text cursor-pointer hover:border-srotram-blue/50 transition-colors">
          {isProcessing ? 'Processing audio...' : 'Choose Audio File'}
        </span>
      </label>

      {selectedName && (
        <p className="text-[10px] text-srotram-muted mt-2 truncate">File: {selectedName}</p>
      )}
      {error && (
        <p className="text-[10px] text-srotram-red mt-2">{error}</p>
      )}

      {latestResult && (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${verdictColor}`}>
          <p className="text-xs font-bold uppercase tracking-wider">Final Verdict: {verdict}</p>
          <p className="text-[11px] mt-1">Risk Score: {Math.round(verdictRisk)}%</p>
          <p className="text-[10px] mt-1 opacity-90">{latestResult.xai_report || 'No explainability report available.'}</p>
        </div>
      )}
    </motion.div>
  );
}
