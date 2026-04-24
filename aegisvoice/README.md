# AegisVoice Intelligence Engine

> **Privacy-First Multi-Layered Edge AI** — Real-time voice clone detection and phishing defense.

## Architecture

```
aegisvoice/
├── frontend/          # React (Vite) + Tailwind + Framer Motion
│   └── src/
│       ├── components/  # ShieldHub, Spectrogram, IntelFeed, etc.
│       ├── hooks/       # useSocket, useAudioCapture
│       └── App.jsx      # Main dashboard
├── gateway/           # Node.js + Socket.io
│   └── server.js      # Binary audio traffic controller
└── ai-engine/         # Python (FastAPI) + PyTorch
    ├── main.py        # Mock intelligence engine
    └── app/
        ├── models/    # RawNet2, Whisper-Tiny
        └── layers/    # Acoustic, Behavioral, NLP, Network
```

## Quick Start

```bash
# 1. Gateway
cd gateway && npm install && npm run dev

# 2. AI Engine
cd ai-engine && pip install -r requirements.txt && python main.py

# 3. Frontend
cd frontend && npm install && npm run dev
```

## 4-Layer Intelligence

| Layer | Technology | Weight |
|-------|-----------|--------|
| Acoustic | RawNet2/Light-CNN | 35% |
| Behavioral | Breathing/Pause Analysis | 25% |
| NLP | Whisper-Tiny + Urgency Detection | 25% |
| Network | Jitter/VoIP Fingerprinting | 15% |

## Ports
- Frontend: `http://localhost:5173`
- Gateway: `http://localhost:4000`
- AI Engine: `http://localhost:8000`
