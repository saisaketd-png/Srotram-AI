import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

export default function IntelFeed({ analysisResult, alert }) {
  const [entries, setEntries] = useState([]);
  const feedRef = useRef(null);

  useEffect(() => {
    if (!analysisResult) return;
    const newEntries = [];
    const ts = new Date().toLocaleTimeString();
    const risk = analysisResult.risk_score || 0;

    // XAI Report — the primary source of truth from the neural engine
    if (analysisResult.xai_report) {
      const type = risk > 75 ? 'scam' : risk > 50 ? 'warning' : 'ok';
      newEntries.push({ id: Date.now() + 1, type, text: analysisResult.xai_report, time: ts });
    }

    // Acoustic layer flag
    if (analysisResult.acoustic_score > 65) {
      newEntries.push({ id: Date.now() + 2, type: 'warning', text: `Acoustic anomaly: ${Math.round(analysisResult.acoustic_score)}% risk score`, time: ts });
    }

    // Behavioral layer flag
    if (analysisResult.behavioral_score > 65) {
      newEntries.push({ id: Date.now() + 3, type: 'anomaly', text: `Behavioral: Unnatural speech rhythm detected (${Math.round(analysisResult.behavioral_score)}%)`, time: ts });
    }

    // Emotion state
    if (analysisResult.emotion?.current === 'flat') {
      newEntries.push({ id: Date.now() + 4, type: 'emotion', text: 'Flat emotional profile — possible AI speech synthesis', time: ts });
    } else if (analysisResult.emotion?.current === 'anxious') {
      newEntries.push({ id: Date.now() + 5, type: 'emotion', text: 'Anxious vocal pattern detected — possible scripted pressure call', time: ts });
    }

    // Old fields — still supported for backwards compatibility
    if (analysisResult.acoustic_artifacts?.length) {
      newEntries.push({ id: Date.now() + 6, type: 'warning', text: `Acoustic: ${analysisResult.acoustic_artifacts.join(', ')}`, time: ts });
    }
    if (analysisResult.behavioral_flags?.length) {
      newEntries.push({ id: Date.now() + 7, type: 'anomaly', text: `Behavioral: ${analysisResult.behavioral_flags.join(', ')}`, time: ts });
    }

    if (newEntries.length === 0) {
      newEntries.push({ id: Date.now(), type: 'ok', text: `Clean signal — no anomalies (Risk: ${Math.round(risk)}%)`, time: ts });
    }

    setEntries(prev => [...newEntries, ...prev].slice(0, 50));
  }, [analysisResult]);

  useEffect(() => {
    if (alert) {
      setEntries(prev => [{ id: Date.now() + 99, type: 'alert', text: `⚠ ALERT: ${alert.message} [Score: ${alert.score}%]`, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
    }
  }, [alert]);

  const typeStyles = {
    ok: 'border-srotram-green/30 text-srotram-green',
    warning: 'border-amber-500/30 text-amber-400',
    anomaly: 'border-srotram-cyan/30 text-srotram-cyan',
    scam: 'border-srotram-red/30 text-srotram-red',
    nlp: 'border-purple-500/30 text-purple-400',
    emotion: 'border-pink-500/30 text-pink-400',
    network: 'border-srotram-blue/30 text-srotram-blue',
    alert: 'border-srotram-red/50 text-srotram-red bg-srotram-red/5'
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
        <h2 className="text-sm font-semibold text-srotram-muted uppercase tracking-wider">Intelligence Feed</h2>
        <span className="text-xs font-mono text-srotram-green">{entries.length} events</span>
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
                  <p className="text-srotram-muted text-[10px] mt-0.5">{entry.time}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="text-center text-srotram-muted text-xs py-8">
            <p>Awaiting audio stream...</p>
            <p className="mt-1 text-[10px]">Intelligence events will appear here</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
