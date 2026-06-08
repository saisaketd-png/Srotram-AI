import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const GATEWAY_URL = 'http://localhost:4000';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [config, setConfig] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [alert, setAlert] = useState(null);
  const [chunkAck, setChunkAck] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [challengePhrase, setChallengePhrase] = useState(null);
  const [challengeResult, setChallengeResult] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = io(GATEWAY_URL, { transports: ['websocket'], reconnection: true, reconnectionDelay: 1000 });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('gateway:connected', (data) => { setSessionId(data.sessionId); setConfig(data.config); });
    socket.on('analysis:result', (data) => setAnalysisResult(data));
    socket.on('analysis:alert', (data) => setAlert(data));
    socket.on('analysis:error', (data) => setError(data));
    socket.on('audio:chunk_ack', (data) => setChunkAck(data));
    socket.on('telemetry:data', (data) => setTelemetry(data));
    socket.on('challenge:phrase', (data) => setChallengePhrase(data));
    socket.on('challenge:result', (data) => setChallengeResult(data));
    socket.on('demo:status', (data) => setDemoMode(Boolean(data.enabled || (data.state > 0))));

    return () => { socket.disconnect(); };
  }, []);

  const sendChunk = useCallback((chunk, sampleRate = 16000) => {
    if (socketRef.current?.connected) {
      // Socket.io requires Uint8Array or Buffer for reliable binary transport, not raw ArrayBuffer
      const uint8 = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk;
      socketRef.current.emit('audio:chunk', { chunk: uint8, sampleRate, timestamp: Date.now() });
    }
  }, []);

  const requestTelemetry = useCallback(() => {
    socketRef.current?.emit('telemetry:request');
  }, []);

  const generateChallenge = useCallback(() => {
    socketRef.current?.emit('challenge:generate');
  }, []);

  const submitChallengeResponse = useCallback(() => {
    socketRef.current?.emit('challenge:response_received');
  }, []);

  const toggleDemo = useCallback((enabled) => {
    socketRef.current?.emit('demo:toggle', { enabled });
  }, []);

  const analyzeDemoFile = useCallback((audioData, fileName, fileType) => {
    socketRef.current?.emit('demo:analyze_file', { audioData, fileName, fileType });
  }, []);

  return {
    connected, sessionId, config, analysisResult, alert, chunkAck, telemetry,
    challengePhrase, challengeResult, demoMode, error,
    sendChunk, requestTelemetry, generateChallenge, submitChallengeResponse,
    toggleDemo, analyzeDemoFile
  };
}
