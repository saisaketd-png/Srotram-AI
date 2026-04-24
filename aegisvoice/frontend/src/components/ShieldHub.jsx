import { motion } from 'framer-motion';

export default function ShieldHub({ riskScore = 0, acoustic = 0, behavioral = 0, nlp = 0, network = 0, onClick }) {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (riskScore / 100) * circumference;

  const getColor = (score) => {
    if (score < 30) return '#22c55e';
    if (score < 60) return '#f59e0b';
    return '#ef4444';
  };

  const color = getColor(riskScore);
  const glowClass = riskScore < 30 ? 'glow-green' : riskScore < 60 ? 'glow-amber' : 'glow-red';

  return (
    <motion.div
      className={`glass-panel p-6 cursor-pointer ${glowClass} relative overflow-hidden`}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider">Multi-Layer Shield</h2>
        <span className="text-xs font-mono text-aegis-muted">CLICK TO EXPAND</span>
      </div>

      {/* Central ring */}
      <div className="flex items-center justify-center">
        <div className="relative">
          <svg width="220" height="220" viewBox="0 0 220 220" className="transform -rotate-90">
            {/* Background ring */}
            <circle cx="110" cy="110" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
            {/* Score ring */}
            <motion.circle
              cx="110" cy="110" r={radius} fill="none"
              stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
            {/* Outer glow ring */}
            <motion.circle
              cx="110" cy="110" r={radius + 12} fill="none"
              stroke={color} strokeWidth="1" opacity="0.3"
              strokeDasharray="8 12"
              animate={{ strokeDashoffset: [0, -100] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-5xl font-bold font-mono"
              style={{ color }}
              key={riskScore}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              {Math.round(riskScore)}
            </motion.span>
            <span className="text-xs text-aegis-muted mt-1 uppercase tracking-widest">Fraud Risk %</span>
          </div>
        </div>
      </div>

      {/* Layer breakdown bars */}
      <div className="mt-6 space-y-3">
        {[
          { label: 'Voice Anomaly', value: acoustic, icon: '🔊' },
          { label: 'Behavioral', value: behavioral, icon: '🧠' },
          { label: 'Language', value: nlp, icon: '💬' },
          { label: 'Network', value: network, icon: '📡' }
        ].map(({ label, value, icon }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-aegis-muted">{icon} {label}</span>
              <span className="font-mono" style={{ color: getColor(value) }}>{Math.round(value)}%</span>
            </div>
            <div className="h-1.5 bg-aegis-border rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: getColor(value) }}
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
