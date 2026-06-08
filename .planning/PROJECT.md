# AegisVoice (Srotram AI) — Core Architecture

## What This Is
AegisVoice (Srotram AI) is a polyglot edge-AI deepfake detection platform. It uses a Vanialla JS/HTML frontend, a Node.js WebSocket gateway, and a Python PyTorch backend to analyze audio streams in real-time, detecting deepfakes via neural analysis (RawNet) and physical heuristics (Replay Attack detection).

## Requirements

### Validated
- ✓ Real-time streaming WebSocket connection between frontend and gateway.
- ✓ Live chunk processing via Gateway.
- ✓ Neural analysis using Finetuned RawNet-v2.
- ✓ Physical heuristic detection (Proximity Effect Bass/Treble analysis).
- ✓ 3-State Evaluator Demo Button (Hidden UI control).

### Active
- [ ] Add real-time alerting for detected threats via email/SMS.
- [ ] Implement database logging for historical attack analysis.
- [ ] Build a reporting dashboard for past 30 days of data.

### Out of Scope
- [Mobile App] — Will focus purely on web-based dashboard for now.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js Gateway | Handles high-throughput audio chunks efficiently | Validated |
| Python AI Engine | Required for PyTorch ecosystem | Validated |
| Built-in GSD Verifier | Using the completely free local review loop instead of CodeRabbit | Pending |

---
*Last updated: Today after initialization*
