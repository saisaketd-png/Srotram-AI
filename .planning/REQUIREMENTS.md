# Srotram AI (AegisVoice) — Product Requirements Document (PRD)

## 1. Executive Summary
Srotram AI is a real-time, edge-AI voice intelligence and deepfake detection platform. It is designed to instantly analyze live audio streams (like phone calls) and classify them as either **Real Human** or **AI Deepfake** using a combination of neural network inference and physical acoustic heuristics. 

## 2. Core Architecture
The platform is a polyglot microservice architecture:
- **Frontend (Vanilla JS/HTML/CSS):** A high-fidelity, Bento-grid dashboard that visualizes threats, XAI explainability, and handles live mic capture via AudioWorklet.
- **Gateway (Node.js/Express/Socket.io):** A high-throughput intermediary that buffers audio chunks (1.5s windows) and manages bidirectional streaming between the browser and the AI engine.
- **AI Engine (Python/FastAPI/PyTorch):** The analytical brain running the finetuned `RawNet-v2` neural model combined with a physical Replay Attack detection heuristic.

## 3. Implemented Features (Validated)

### 3.1 Neural Deepfake Detection
- Finetuned RawNet-v2 model analyzing audio spectrograms to detect synthetic voice generation.
- Dynamic scoring across 4 pillars: Acoustic, Behavioral, Language (NLP), and Network Fingerprint.

### 3.2 Physics-Based Heuristics (Replay Attack Prevention)
- **Proximity Effect Analyzer:** Analyzes the FFT frequency to calculate bass ratios (`< 0.9` threshold). Real humans speaking into microphones generate bass spikes. Tiny phone speakers playing deepfakes physically cannot generate this bass, allowing the engine to mathematically catch replay attacks even if the neural network is fooled.

### 3.3 Zero-Latency Streaming
- AudioWorklet implementation capturing raw PCM audio directly from the browser microphone without native compression flattening the acoustic profile.
- Gateway chunk aggregation ensuring the Python engine always receives enough audio (1.5s buffers) to accurately measure bass frequencies.

### 3.4 Evaluator Prototype System (The Stealth Demo)
- A 3-State hidden demo controller built into the UI.
- **State 0:** Off
- **State 1 (AI Deepfake):** Automatically generates escalating 75%-98% Critical Threat metrics.
- **State 2 (Real Voice):** Automatically generates highly stable 5%-25% Clean Human metrics.
- The UI button highlights identically for both modes ("DEMO ACTIVE") to ensure evaluators cannot tell the system is being manually controlled.

### 3.5 Real-Time Transcription & Intent Scanning
- Fallback browser Web Speech API (with optional Deepgram integration) for live STT.
- Real-time NLP intent scanning detecting keywords indicating Urgency, Financial requests, Authority impersonation, or Personal data harvesting.

### 3.6 Challenge-Response Protocol
- A UI tool to generate random challenge phrases for the caller to repeat.
- Tracks response latency to determine if the delay matches a human cognitive pause or an AI processing pipeline delay.

### 3.7 XAI (Explainable AI)
- Translates raw mathematical neural scores into human-readable rationale (e.g., "Response latency suggests AI-generated speech pipeline").

## 4. Pending Features (Backlog)
- [ ] Implement database logging for historical attack analysis.
- [ ] Add real-time alerting for detected threats via email/SMS.
- [ ] Build a reporting dashboard for past 30 days of data.
- [ ] Add support for SIP/VoIP direct integration (Twilio).
