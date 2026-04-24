import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function HardwareTelemetry({ telemetry, latency, onRefresh }) {
  const [sparkData, setSparkData] = useState(Array(20).fill(0));

  useEffect(() => {
    if (latency != null) {
      setSparkData(prev => [...prev.slice(1), latency]);
    }
  }, [latency]);

  const gpu = telemetry?.gpu || {};
  const vramPct = gpu.vram_total ? Math.round((gpu.vram_used / gpu.vram_total) * 100) : 0;
  const maxSpark = Math.max(...sparkData, 1);
  const isOnline = telemetry?.status === 'operational';

  return (
    <motion.div
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider">Hardware Telemetry</h2>
        <div className="flex items-center gap-2">
          <motion.div
            className={`w-2 h-2 rounded-full ${isOnline ? 'bg-aegis-green' : 'bg-aegis-red'}`}
            animate={{ opacity: isOnline ? [1, 0.5, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[10px] font-mono text-aegis-muted">{isOnline ? 'GPU ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* GPU Badge */}
      <div className="bg-aegis-black/50 border border-aegis-green/20 rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-aegis-green text-xs">⚡</span>
          <span className="text-xs font-semibold text-aegis-green">GPU Accelerated: {gpu.name || 'RTX 3040'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-mono font-bold text-aegis-text">{vramPct}%</p>
            <p className="text-[10px] text-aegis-muted">VRAM</p>
          </div>
          <div>
            <p className="text-lg font-mono font-bold text-aegis-text">{gpu.utilization || 0}%</p>
            <p className="text-[10px] text-aegis-muted">UTIL</p>
          </div>
          <div>
            <p className="text-lg font-mono font-bold text-aegis-text">{gpu.temperature || '--'}°C</p>
            <p className="text-[10px] text-aegis-muted">TEMP</p>
          </div>
        </div>
      </div>

      {/* Latency sparkline */}
      <div>
        <div className="flex justify-between text-[10px] text-aegis-muted mb-1">
          <span>Inference Latency</span>
          <span className="font-mono">{latency || 0}ms</span>
        </div>
        <div className="flex items-end gap-[2px] h-8 bg-aegis-black/30 rounded p-1">
          {sparkData.map((v, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-sm sparkline-bar"
              style={{
                height: `${(v / maxSpark) * 100}%`,
                backgroundColor: v < 200 ? '#22c55e' : v < 300 ? '#f59e0b' : '#ef4444',
                minHeight: '2px'
              }}
              layout
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-aegis-muted mt-0.5">
          <span>Target: &lt;250ms</span>
          <span>{telemetry?.inference_count || 0} inferences</span>
        </div>
      </div>
    </motion.div>
  );
}
