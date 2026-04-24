import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { motion } from 'framer-motion';

export default function LiveSpectrogram({ isRecording, riskScore = 0, audioLevel = 0 }) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);

  const baseColor = riskScore < 30 ? '#22c55e' : riskScore < 60 ? '#f59e0b' : '#ef4444';
  const progressColor = riskScore < 30 ? '#166534' : riskScore < 60 ? '#92400e' : '#991b1b';

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: baseColor,
      progressColor: progressColor,
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 100,
      normalize: true,
      backend: 'WebAudio',
      responsive: true,
      interact: false
    });

    wavesurferRef.current = ws;

    return () => { ws.destroy(); };
  }, []);

  // Update colors dynamically
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setOptions({ waveColor: baseColor, progressColor });
    }
  }, [baseColor, progressColor]);

  return (
    <motion.div
      className="glass-panel p-4 relative overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider">Live Spectrogram</h2>
        <div className="flex items-center gap-2">
          {isRecording && (
            <motion.div
              className="w-2 h-2 rounded-full bg-aegis-red"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
          <span className="text-xs font-mono text-aegis-muted">{isRecording ? 'LIVE' : 'IDLE'}</span>
        </div>
      </div>

      {/* Waveform container */}
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden bg-aegis-black/50" />

      {/* Fake animated waveform when no real data */}
      {!isRecording && (
        <div className="flex items-end justify-center gap-[2px] h-[100px] px-2 -mt-[100px] relative">
          {Array.from({ length: 80 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-[2px] rounded-full"
              style={{ backgroundColor: `${baseColor}40` }}
              animate={{ height: [4, 8 + Math.random() * 12, 4] }}
              transition={{ duration: 1.5 + Math.random(), repeat: Infinity, delay: i * 0.02 }}
            />
          ))}
        </div>
      )}

      {/* Audio level indicator */}
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-aegis-muted">Level</span>
        <div className="flex-1 h-1 bg-aegis-border rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: baseColor }}
            animate={{ width: `${audioLevel * 100}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <span className="text-xs font-mono" style={{ color: baseColor }}>{Math.round(audioLevel * 100)}%</span>
      </div>
    </motion.div>
  );
}
