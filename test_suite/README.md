# Srotram AI — Test Suite

## Folder Structure
```
test_suite/
├── test_model.py       ← Run this script
├── real/               ← Drop REAL voice WAV files here
│   └── (your recordings)
├── ai/                 ← Drop AI/deepfake WAV files here
│   └── (ElevenLabs, TTS, cloned voices)
└── README.md           ← This file
```

---

## Step-by-Step Test Process

### Step 1 — Prepare Audio Files

**Real voice samples (`test_suite/real/`):**
- Record yourself speaking 5–10 seconds using Audacity, Voice Recorder, or your phone
- Save as `.wav` format (any sample rate — the script auto-resamples to 16kHz)
- Name them: `real_01.wav`, `real_02.wav`, etc.

**AI voice samples (`test_suite/ai/`):**
- Use ElevenLabs (free tier), Google TTS, Azure TTS, or any deepfake tool
- Say the same or similar sentences as your real samples
- Save as `.wav`
- Name them: `ai_01.wav`, `ai_02.wav`, etc.

> **Tip:** For a proper test, you need at least 5 samples in each folder.  
> For a rigorous test, 20+ samples per category.

---

### Step 2 — Run the Test

Open a terminal and run:
```bash
py -3.12 test_model.py
```

---

### Step 3 — Read the Report

The script prints:
```
═══════════════════════════════════════════════════
  📊 ACCURACY REPORT
═══════════════════════════════════════════════════
  Files tested:  20
  Correct:       19
  Accuracy:      95.0%

  Confusion Matrix:
  ┌─────────────┬──────────┬──────────┐
  │             │ Pred: AI │Pred: REAL│
  ├─────────────┼──────────┼──────────┤
  │ True:  AI   │    9 TP  │    1 FN  │
  │ True: REAL  │    0 FP  │   10 TN  │
  └─────────────┴──────────┴──────────┘

  Precision:    100.0%  (of AI alerts, how many were correct)
  Recall:       90.0%   (of AI samples, how many were caught)
  F1 Score:     94.7%
```

---

### What the metrics mean

| Metric | Meaning |
|--------|---------|
| **Accuracy** | % of files classified correctly |
| **Precision** | When it says "AI", how often is it right? |
| **Recall** | Of all AI files, how many were caught? |
| **F1 Score** | Balanced precision + recall score |
| **False Positive (FP)** | Real voice wrongly called AI (bad!) |
| **False Negative (FN)** | AI voice missed, called real (dangerous!) |

---

### Interpreting Results

| Accuracy | Status |
|----------|--------|
| ≥ 90% | ✅ Production ready |
| 80–90% | ⚠️ Acceptable, consider more training data |
| 70–80% | 🔴 Needs fine-tuning |
| < 70% | 🚨 Model is not reliable |

---

### If Accuracy is Low

1. **False Positives** (real voice flagged): The model is too aggressive. Lower the `THRESHOLD` in `test_model.py` from 55% to 45%.

2. **False Negatives** (AI voice missed): The model is too lenient. Increase `THRESHOLD` to 65%. Or use `finetune.py` to train on more AI samples.

3. **Phone-played audio not detected**: This is the hardest case. Play your AI samples through speakers and record — this adds acoustic realism.
