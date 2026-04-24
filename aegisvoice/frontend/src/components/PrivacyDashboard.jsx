import { motion } from 'framer-motion';

export default function PrivacyDashboard() {
  const dataFlows = [
    { from: 'Microphone', to: 'Browser (MediaRecorder)', color: '#22c55e', secure: true },
    { from: 'Browser', to: 'Gateway (localhost:4000)', color: '#22c55e', secure: true },
    { from: 'Gateway', to: 'AI Engine (localhost:8000)', color: '#22c55e', secure: true },
    { from: 'AI Engine', to: 'RTX 3040 GPU (CUDA)', color: '#06b6d4', secure: true },
    { from: 'External APIs', to: 'NONE', color: '#ef4444', secure: false, blocked: true }
  ];

  return (
    <motion.div
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider">🔒 Privacy Dashboard</h2>
        <span className="text-[10px] font-mono text-aegis-green bg-aegis-green/10 px-2 py-0.5 rounded border border-aegis-green/30">
          100% LOCAL
        </span>
      </div>

      <p className="text-[11px] text-aegis-muted mb-3">
        All processing happens on-device. Zero external API calls. No ElevenLabs, No OpenAI, No cloud.
      </p>

      <div className="space-y-2">
        {dataFlows.map((flow, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2 text-[11px] font-mono"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${flow.blocked ? 'bg-aegis-red' : 'bg-aegis-green'}`} />
            <span className="text-aegis-text">{flow.from}</span>
            <span className="text-aegis-muted">{flow.blocked ? '✕' : '→'}</span>
            <span style={{ color: flow.color }}>{flow.to}</span>
            {flow.blocked && <span className="text-aegis-red text-[9px] ml-auto">BLOCKED</span>}
          </motion.div>
        ))}
      </div>

      {/* Data retention */}
      <div className="mt-3 pt-3 border-t border-aegis-border">
        <div className="flex items-center gap-2 text-[10px] text-aegis-muted">
          <span>🗑️ Data Retention: </span>
          <span className="text-aegis-green font-semibold">Session-only (RAM)</span>
          <span>• No disk writes • No logs shipped</span>
        </div>
      </div>
    </motion.div>
  );
}
