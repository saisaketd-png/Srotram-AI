import { motion } from 'framer-motion';

export default function EmotionDrift({ emotion }) {
  if (!emotion) return null;

  const emotionColors = {
    neutral: '#64748b', anxious: '#f59e0b', calm: '#22c55e',
    aggressive: '#ef4444', fearful: '#a855f7', flat: '#6b7280'
  };

  const color = emotionColors[emotion.current] || '#64748b';
  const driftScore = emotion.drift_score || 0;

  return (
    <motion.div
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
    >
      <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider mb-3">Emotional Drift</h2>

      <div className="flex items-center gap-3 mb-3">
        <motion.div
          className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg"
          style={{ borderColor: color, boxShadow: `0 0 12px ${color}40` }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {emotion.current === 'neutral' ? '😐' : emotion.current === 'anxious' ? '😰' :
           emotion.current === 'calm' ? '😌' : emotion.current === 'aggressive' ? '😠' :
           emotion.current === 'fearful' ? '😨' : '😶'}
        </motion.div>
        <div>
          <p className="text-sm font-semibold capitalize" style={{ color }}>{emotion.current}</p>
          <p className="text-[10px] text-aegis-muted">Drift: {Math.round(driftScore)}%</p>
        </div>
        {emotion.is_flat && (
          <motion.span
            className="ml-auto text-[10px] font-mono text-aegis-red bg-aegis-red/10 px-2 py-1 rounded border border-aegis-red/30"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            FLAT
          </motion.span>
        )}
      </div>

      {/* History timeline */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-aegis-muted mr-1">History:</span>
        {(emotion.history || []).map((e, i) => (
          <motion.div
            key={i}
            className="w-5 h-5 rounded text-[10px] flex items-center justify-center"
            style={{ backgroundColor: `${emotionColors[e] || '#64748b'}20`, border: `1px solid ${emotionColors[e] || '#64748b'}40` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.1 }}
            title={e}
          >
            {e === 'neutral' ? '😐' : e === 'anxious' ? '😰' : e === 'calm' ? '😌' :
             e === 'aggressive' ? '😠' : e === 'fearful' ? '😨' : '😶'}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
