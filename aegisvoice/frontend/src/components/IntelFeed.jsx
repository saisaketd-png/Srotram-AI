import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

export default function IntelFeed({ analysisResult, alert }) {
  const [entries, setEntries] = useState([]);
  const feedRef = useRef(null);

  useEffect(() => {
    if (!analysisResult) return;
    const newEntries = [];
    const ts = new Date().toLocaleTimeString();

    if (analysisResult.acoustic_artifacts?.length) {
      newEntries.push({ id: Date.now() + 1, type: 'warning', text: `Acoustic: ${analysisResult.acoustic_artifacts.join(', ')}`, time: ts });
    }
    if (analysisResult.behavioral_flags?.length) {
      newEntries.push({ id: Date.now() + 2, type: 'anomaly', text: `Behavioral: ${analysisResult.behavioral_flags.join(', ')}`, time: ts });
    }
    if (analysisResult.nlp_flags?.length) {
      newEntries.push({ id: Date.now() + 3, type: 'scam', text: `Scam indicators: ${analysisResult.nlp_flags.join(', ')}`, time: ts });
    }
    if (analysisResult.nlp_phrases?.length) {
      newEntries.push({ id: Date.now() + 4, type: 'nlp', text: `Flagged: "${analysisResult.nlp_phrases[0]}"`, time: ts });
    }
    if (analysisResult.emotion?.is_flat) {
      newEntries.push({ id: Date.now() + 5, type: 'emotion', text: 'Emotional flatness detected — possible AI speech', time: ts });
    }
    if (analysisResult.network_protocol === 'VoIP/SIP') {
      newEntries.push({ id: Date.now() + 6, type: 'network', text: `VoIP detected (jitter: ${analysisResult.network_jitter}ms)`, time: ts });
    }
    if (newEntries.length === 0) {
      newEntries.push({ id: Date.now(), type: 'ok', text: 'No anomalies detected in this window', time: ts });
    }

    setEntries(prev => [...newEntries, ...prev].slice(0, 50));
  }, [analysisResult]);

  useEffect(() => {
    if (alert) {
      setEntries(prev => [{ id: Date.now() + 99, type: 'alert', text: `⚠ ALERT: ${alert.message} [Score: ${alert.score}%]`, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
    }
  }, [alert]);

  const typeStyles = {
    ok: 'border-aegis-green/30 text-aegis-green',
    warning: 'border-amber-500/30 text-amber-400',
    anomaly: 'border-aegis-cyan/30 text-aegis-cyan',
    scam: 'border-aegis-red/30 text-aegis-red',
    nlp: 'border-purple-500/30 text-purple-400',
    emotion: 'border-pink-500/30 text-pink-400',
    network: 'border-aegis-blue/30 text-aegis-blue',
    alert: 'border-aegis-red/50 text-aegis-red bg-aegis-red/5'
  };

  const typeIcons = { ok: '✓', warning: '⚡', anomaly: '🧠', scam: '🚨', nlp: '💬', emotion: '😶', network: '📡', alert: '🔴' };

  return (
    <motion.div
      className="glass-panel p-4 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      style={{ maxHeight: '400px' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider">Intelligence Feed</h2>
        <span className="text-xs font-mono text-aegis-green">{entries.length} events</span>
      </div>

      <div ref={feedRef} className="flex-1 overflow-y-auto space-y-2 feed-scroll pr-1">
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              className={`border-l-2 pl-3 py-1.5 text-xs font-mono ${typeStyles[entry.type] || typeStyles.ok}`}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start gap-2">
                <span>{typeIcons[entry.type]}</span>
                <div className="flex-1">
                  <p className="leading-relaxed">{entry.text}</p>
                  <p className="text-aegis-muted text-[10px] mt-0.5">{entry.time}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="text-center text-aegis-muted text-xs py-8">
            <p>Awaiting audio stream...</p>
            <p className="mt-1 text-[10px]">Intelligence events will appear here</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
