import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

export default function ChallengeResponse({ onGenerate, onSubmitResponse, phrase, result }) {
  const [timer, setTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);
  const intervalRef = useRef(null);

  const handleGenerate = () => {
    onGenerate();
    setIsWaiting(true);
    setElapsed(0);
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 50);
  };

  const handleResponse = () => {
    onSubmitResponse();
    setIsWaiting(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    if (result) {
      setIsWaiting(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [result]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const getAssessmentColor = (assessment) => {
    if (assessment === 'natural') return '#22c55e';
    if (assessment === 'suspicious') return '#f59e0b';
    return '#ef4444';
  };

  return (
    <motion.div
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider">🎯 Challenge-Response</h2>
        {isWaiting && (
          <motion.span
            className="text-xs font-mono text-aegis-amber"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            {(elapsed / 1000).toFixed(1)}s
          </motion.span>
        )}
      </div>

      <p className="text-[11px] text-aegis-muted mb-3">
        Generate a random phrase and ask the caller to repeat it. Measures response latency to detect AI processing delay.
      </p>

      {/* Phrase display */}
      {phrase && (
        <motion.div
          className="bg-aegis-black/60 border border-aegis-border rounded-lg p-3 mb-3"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <p className="text-xs text-aegis-muted mb-1">Ask caller to say:</p>
          <p className="text-sm font-medium text-aegis-text leading-relaxed">"{phrase.phrase}"</p>
        </motion.div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        {!isWaiting ? (
          <motion.button
            className="flex-1 py-2 px-4 rounded-lg bg-aegis-green/10 border border-aegis-green/30 text-aegis-green text-xs font-semibold uppercase tracking-wider hover:bg-aegis-green/20 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
          >
            Generate Phrase
          </motion.button>
        ) : (
          <motion.button
            className="flex-1 py-2 px-4 rounded-lg bg-aegis-amber/10 border border-aegis-amber/30 text-aegis-amber text-xs font-semibold uppercase tracking-wider hover:bg-aegis-amber/20 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleResponse}
            animate={{ boxShadow: ['0 0 0px rgba(245,158,11,0)', '0 0 15px rgba(245,158,11,0.2)', '0 0 0px rgba(245,158,11,0)'] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Caller Responded ✓
          </motion.button>
        )}
      </div>

      {/* Result */}
      {result && (
        <motion.div
          className="mt-3 p-3 rounded-lg border"
          style={{ borderColor: `${getAssessmentColor(result.assessment)}40`, backgroundColor: `${getAssessmentColor(result.assessment)}08` }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase" style={{ color: getAssessmentColor(result.assessment) }}>
              {result.assessment === 'natural' ? '✅ Natural' : result.assessment === 'suspicious' ? '⚠️ Suspicious' : '🚨 Likely AI'}
            </span>
            <span className="text-xs font-mono text-aegis-muted">{result.latency_ms}ms latency</span>
          </div>
          <p className="text-[10px] text-aegis-muted mt-1">
            {result.assessment === 'natural' ? 'Response time consistent with human speech' :
             result.assessment === 'suspicious' ? 'Elevated latency — possible processing delay' :
             'High latency strongly suggests AI-generated response'}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
