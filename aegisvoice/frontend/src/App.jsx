import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from './hooks/useSocket';
import { useAudioCapture } from './hooks/useAudioCapture';
import ShieldHub from './components/ShieldHub';
import LiveSpectrogram from './components/LiveSpectrogram';
import IntelFeed from './components/IntelFeed';
import ChallengeResponse from './components/ChallengeResponse';
import HardwareTelemetry from './components/HardwareTelemetry';
import EmotionDrift from './components/EmotionDrift';
import PrivacyDashboard from './components/PrivacyDashboard';

export default function App() {
  const socket = useSocket();
  const [activeTab, setActiveTab] = useState('monitor');
  const [analysisHistory, setAnalysisHistory] = useState([]);

  const onChunk = useCallback((buf) => {
    socket.sendChunk(buf);
  }, [socket.sendChunk]);

  const audio = useAudioCapture(onChunk, 500);

  // Poll telemetry
  useEffect(() => {
    const iv = setInterval(() => { socket.requestTelemetry(); }, 3000);
    return () => clearInterval(iv);
  }, [socket.requestTelemetry]);

  // Track history
  useEffect(() => {
    if (socket.analysisResult) {
      setAnalysisHistory(prev => [socket.analysisResult, ...prev].slice(0, 100));
    }
  }, [socket.analysisResult]);

  const result = socket.analysisResult || {};
  const riskScore = result.risk_score || 0;

  const tabs = [
    { id: 'monitor', label: 'Monitor', icon: '📡' },
    { id: 'privacy', label: 'Privacy', icon: '🔒' }
  ];

  return (
    <div className="min-h-screen bg-aegis-black grid-bg relative">
      {/* Background beams */}
      <div className="bg-beams" />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-aegis-border bg-aegis-dark/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-aegis-green to-aegis-cyan flex items-center justify-center text-aegis-black font-black text-sm"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                A
              </motion.div>
              <div>
                <h1 className="text-base font-bold text-aegis-text tracking-tight">AegisVoice</h1>
                <p className="text-[10px] text-aegis-muted -mt-0.5">Intelligence Engine v1.0</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Connection status */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${socket.connected ? 'bg-aegis-green' : 'bg-aegis-red'}`} />
                <span className="text-[10px] font-mono text-aegis-muted">
                  {socket.connected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>

              {/* Tabs */}
              <div className="flex bg-aegis-black/50 rounded-lg p-0.5 border border-aegis-border">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-aegis-panel text-aegis-text'
                        : 'text-aegis-muted hover:text-aegis-text'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Demo Mode Toggle */}
              <button
                onClick={() => socket.toggleDemo(!socket.demoMode)}
                className={`px-3 py-1 rounded-lg text-[10px] font-mono font-semibold border transition-all ${
                  socket.demoMode
                    ? 'bg-purple-500/10 border-purple-500/40 text-purple-400'
                    : 'bg-aegis-black/50 border-aegis-border text-aegis-muted hover:text-aegis-text'
                }`}
              >
                {socket.demoMode ? '🎭 DEMO ON' : 'DEMO'}
              </button>

              {/* Record button */}
              <motion.button
                onClick={audio.isRecording ? audio.stopRecording : audio.startRecording}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
                  audio.isRecording
                    ? 'bg-aegis-red/10 border-aegis-red/40 text-aegis-red'
                    : 'bg-aegis-green/10 border-aegis-green/40 text-aegis-green hover:bg-aegis-green/20'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={audio.isRecording ? { boxShadow: ['0 0 0px rgba(239,68,68,0)', '0 0 20px rgba(239,68,68,0.3)', '0 0 0px rgba(239,68,68,0)'] } : {}}
                transition={audio.isRecording ? { duration: 1.5, repeat: Infinity } : {}}
              >
                {audio.isRecording ? '⏹ Stop' : '🎙 Analyze'}
              </motion.button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-[1600px] mx-auto p-4">
          <AnimatePresence mode="wait">
            {activeTab === 'monitor' ? (
              <motion.div
                key="monitor"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-12 gap-4"
              >
                {/* Left column — Shield + Spectrogram */}
                <div className="col-span-4 space-y-4">
                  <ShieldHub
                    riskScore={riskScore}
                    acoustic={result.acoustic_score || 0}
                    behavioral={result.behavioral_score || 0}
                    nlp={result.nlp_score || 0}
                    network={result.network_score || 0}
                  />
                  <LiveSpectrogram
                    isRecording={audio.isRecording}
                    riskScore={riskScore}
                    audioLevel={audio.audioLevel}
                  />
                  <EmotionDrift emotion={result.emotion} />
                </div>

                {/* Center column — Intel Feed */}
                <div className="col-span-5 space-y-4">
                  <IntelFeed
                    analysisResult={socket.analysisResult}
                    alert={socket.alert}
                  />

                  {/* XAI Report */}
                  {result.xai_report && (
                    <motion.div
                      className="glass-panel p-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <h2 className="text-sm font-semibold text-aegis-muted uppercase tracking-wider mb-2">
                        🧪 XAI Report
                      </h2>
                      <p className="text-xs font-mono text-aegis-text leading-relaxed">
                        {result.xai_report}
                      </p>
                      {result.inference_ms && (
                        <p className="text-[10px] text-aegis-muted mt-2">
                          Inference: {result.inference_ms}ms | Audio: {result.audio_bytes} bytes | Model: {result.model_version}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Stats bar */}
                  <div className="glass-panel px-4 py-2 flex items-center justify-between text-[10px] font-mono text-aegis-muted">
                    <span>Chunks: {socket.chunkAck?.chunkIndex || 0}</span>
                    <span>Buffer: {socket.chunkAck?.bufferSize || 0}/4</span>
                    <span>Bytes: {((socket.chunkAck?.bytesReceived || 0) / 1024).toFixed(1)} KB</span>
                    <span>Session: {socket.sessionId?.slice(0, 8) || '—'}</span>
                  </div>
                </div>

                {/* Right column — Challenge + Telemetry */}
                <div className="col-span-3 space-y-4">
                  <ChallengeResponse
                    onGenerate={socket.generateChallenge}
                    onSubmitResponse={socket.submitChallengeResponse}
                    phrase={socket.challengePhrase}
                    result={socket.challengeResult}
                  />
                  <HardwareTelemetry
                    telemetry={socket.telemetry}
                    latency={result.latency_ms || socket.analysisResult?.latency_ms}
                    onRefresh={socket.requestTelemetry}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="privacy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-2xl mx-auto"
              >
                <PrivacyDashboard />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
