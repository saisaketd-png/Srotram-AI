import { motion } from 'framer-motion';

function LayerBar({ label, value, icon }) {
  const getColor = (s) => s < 30 ? '#48BB78' : s < 60 ? '#ECC94B' : '#F56565';
  const color = getColor(value);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-srotram-muted">{icon} {label}</span>
        <motion.span
          className="font-mono"
          style={{ color }}
          key={Math.round(value)}
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {Math.round(value)}%
        </motion.span>
      </div>
      <div className="h-1.5 bg-srotram-border rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${Math.min(100, value)}%` }}
          layout
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export default function ShieldHub({ riskScore = 0, acoustic = 0, behavioral = 0, nlp = 0, network = 0, isRecording = false, audioLevel = 0 }) {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (riskScore / 100) * circumference;
  const getColor = (s) => s < 30 ? '#48BB78' : s < 60 ? '#ECC94B' : '#F56565';
  const color = getColor(riskScore);
  const glowClass = riskScore < 30 ? 'glow-green' : riskScore < 60 ? 'glow-amber' : 'glow-red';

  // Live mic meter level — clamp to 0-100
  const micLevel = Math.min(100, audioLevel * 400);

  return (
    <motion.div
      className={`glass-panel p-6 ${glowClass} relative overflow-hidden`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-srotram-muted uppercase tracking-wider">Multi-Layer Shield</h2>
        {/* Live Mic Meter */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-srotram-red animate-pulse' : 'bg-srotram-border'}`} />
          <div className="w-20 h-1.5 bg-srotram-border rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-green-400 to-cyan-400"
              style={{ width: `${micLevel}%` }}
              layout
              transition={{ duration: 0.1 }}
            />
          </div>
          <span className="text-[9px] font-mono text-srotram-muted">{isRecording ? 'LIVE' : 'OFF'}</span>
        </div>
      </div>

      {/* Central ring */}
      <div className="flex items-center justify-center">
        <div className="relative">
          <svg width="220" height="220" viewBox="0 0 220 220" className="transform -rotate-90">
            <circle cx="110" cy="110" r={radius} fill="none" stroke="#2D3748" strokeWidth="8" />
            <motion.circle
              cx="110" cy="110" r={radius} fill="none"
              stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
            <motion.circle
              cx="110" cy="110" r={radius + 12} fill="none"
              stroke={color} strokeWidth="1" opacity="0.3"
              strokeDasharray="8 12"
              animate={{ strokeDashoffset: [0, -100] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-5xl font-bold font-mono"
              style={{ color }}
              key={Math.round(riskScore)}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              {Math.round(riskScore)}
            </motion.span>
            <span className="text-xs text-srotram-muted mt-1 uppercase tracking-widest">Fraud Risk %</span>
          </div>
        </div>
      </div>

      {/* Layer breakdown bars */}
      <div className="mt-6 space-y-3">
        <LayerBar label="Voice Anomaly" value={acoustic} icon="🔊" />
        <LayerBar label="Behavioral" value={behavioral} icon="🧠" />
        <LayerBar label="Language" value={nlp} icon="💬" />
        <LayerBar label="Network" value={network} icon="📡" />
      </div>
    </motion.div>
  );
}
