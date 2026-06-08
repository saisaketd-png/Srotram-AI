import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioCapture(onChunk, chunkDuration = 500) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const animFrameRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      
      // ScriptProcessor is used here for maximum compatibility and to avoid native binary issues
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      let pcmBuffer = [];
      const samplesPerChunk = 16000 * (chunkDuration / 1000);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        pcmBuffer.push(...inputData);

        // Calculate audio level for UI
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        setAudioLevel(Math.sqrt(sum / inputData.length));

        // If we have enough samples for a 500ms chunk, send it
        if (pcmBuffer.length >= samplesPerChunk) {
          const chunk = new Float32Array(pcmBuffer.slice(0, samplesPerChunk));
          onChunk(chunk.buffer);
          pcmBuffer = pcmBuffer.slice(samplesPerChunk);
        }
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);
      processorRef.current = processor;

      setIsRecording(true);
    } catch (err) {
      console.error('Mic access failed:', err);
    }
  }, [onChunk, chunkDuration]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => { stopRecording(); };
  }, [stopRecording]);

  return { isRecording, audioLevel, startRecording, stopRecording };
}
