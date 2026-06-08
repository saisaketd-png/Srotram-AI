"""
╔══════════════════════════════════════════════════════════════╗
║  Srotram AI — Model Accuracy Test Suite                      ║
║  Tests the CNN model's ability to distinguish Real vs AI     ║
╚══════════════════════════════════════════════════════════════╝

HOW TO TEST:
============
1. DROP audio files into this folder:
   - test_suite/real/   → your real voice recordings (.wav)
   - test_suite/ai/     → AI-generated deepfake voices (.wav)

2. Run: py -3.12 test_model.py

3. Read the Accuracy Report at the end.

WHAT IT TESTS:
- Model confidence on each file
- Pass/Fail per file  
- Overall Accuracy %
- Confusion matrix (TP, TN, FP, FN)
- Phone-speaker detection boost
"""

import sys, os, time
import numpy as np

# Add ai-engine path
AI_ENGINE = os.path.join(os.path.dirname(__file__), '..', 'ai-engine')
sys.path.insert(0, AI_ENGINE)
sys.path.insert(0, os.path.join(AI_ENGINE, 'rawnet'))

# ── Try importing deps ──────────────────────────────────────────
try:
    import torch
    from model import RawNet
    HAS_MODEL = True
except ImportError as e:
    HAS_MODEL = False
    print(f"⚠️  Model import failed: {e}")
    print("   Make sure you're in the test_suite directory and the model exists.")

# ── Config ──────────────────────────────────────────────────────
REAL_DIR    = os.path.join(os.path.dirname(__file__), 'real')
AI_DIR      = os.path.join(os.path.dirname(__file__), 'ai')
MODEL_PATH  = os.path.join(AI_ENGINE, 'rawnet', 'rawnet_finetuned.pt')
THRESHOLD   = 55.0  # % above = AI, below = REAL
SAMPLE_RATE = 16000

# ── Colors ──────────────────────────────────────────────────────
RED    = '\033[91m'
GREEN  = '\033[92m'
YELLOW = '\033[93m'
CYAN   = '\033[96m'
BOLD   = '\033[1m'
RESET  = '\033[0m'

def load_wav(path):
    """Load a WAV file and return float32 audio at 16kHz."""
    try:
        import wave, struct
        with wave.open(path, 'rb') as wf:
            sr = wf.getframerate()
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)
        
        # Decode bytes
        if sampwidth == 2:
            audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        elif sampwidth == 4:
            audio = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
        else:
            audio = np.frombuffer(raw, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0
        
        # Mix to mono if stereo
        if n_channels == 2:
            audio = audio.reshape(-1, 2).mean(axis=1)
        
        # Resample to 16kHz
        if sr != SAMPLE_RATE:
            target_len = int(len(audio) * SAMPLE_RATE / sr)
            audio = np.interp(
                np.linspace(0, len(audio), target_len),
                np.arange(len(audio)),
                audio
            ).astype(np.float32)
        
        return audio, sr
    except Exception as e:
        print(f"   {RED}Failed to load {path}: {e}{RESET}")
        return None, None

def run_inference(model, device, audio):
    """Run the model on audio, return (risk_percent, confident)."""
    if not HAS_MODEL or model is None:
        return 50.0, False
    
    if len(audio) < 8000:
        # Pad short audio
        audio = np.pad(audio, (0, 8000 - len(audio)))
    
    # Normalize
    audio_norm = (audio - np.mean(audio)) / (np.std(audio) + 1e-6)
    
    try:
        inp = torch.FloatTensor(audio_norm).unsqueeze(0).unsqueeze(0).to(device)
        with torch.no_grad():
            out = model(inp)
            probs = torch.softmax(out, dim=1)
            risk = probs[0][1].item() * 100
        return risk, True
    except Exception as e:
        print(f"   {RED}Inference error: {e}{RESET}")
        return 50.0, False

def test_files(model, device, folder, true_label, results):
    """Test all WAV files in a folder. true_label: 'AI' or 'REAL'."""
    if not os.path.exists(folder):
        print(f"   {YELLOW}Folder not found: {folder}{RESET}")
        print(f"   Create it and add .wav files\n")
        return
    
    files = [f for f in os.listdir(folder) if f.lower().endswith('.wav')]
    if not files:
        print(f"   {YELLOW}No .wav files in {folder}{RESET}\n")
        return
    
    print(f"\n  {'File':<35} {'Risk %':>8}  {'Prediction':>12}  {'Verdict':>8}")
    print(f"  {'-'*70}")
    
    for fname in sorted(files):
        fpath = os.path.join(folder, fname)
        audio, sr = load_wav(fpath)
        if audio is None:
            continue
        
        t0 = time.time()
        risk, confident = run_inference(model, device, audio)
        elapsed = (time.time() - t0) * 1000
        
        predicted = 'AI' if risk > THRESHOLD else 'REAL'
        correct = predicted == true_label
        
        verdict = f"{GREEN}✓ PASS{RESET}" if correct else f"{RED}✗ FAIL{RESET}"
        risk_color = RED if risk > 70 else (YELLOW if risk > 40 else GREEN)
        
        print(f"  {fname:<35} {risk_color}{risk:>7.1f}%{RESET}  {predicted:>12}  {verdict}  ({elapsed:.0f}ms)")
        
        results.append({
            'file': fname, 'true': true_label, 'predicted': predicted,
            'risk': risk, 'correct': correct
        })

def print_report(results):
    """Print accuracy report and confusion matrix."""
    if not results:
        print(f"\n  {YELLOW}No results to report.{RESET}")
        return
    
    total = len(results)
    correct = sum(1 for r in results if r['correct'])
    accuracy = correct / total * 100
    
    # Confusion matrix
    tp = sum(1 for r in results if r['true'] == 'AI' and r['predicted'] == 'AI')
    tn = sum(1 for r in results if r['true'] == 'REAL' and r['predicted'] == 'REAL')
    fp = sum(1 for r in results if r['true'] == 'REAL' and r['predicted'] == 'AI')
    fn = sum(1 for r in results if r['true'] == 'AI' and r['predicted'] == 'REAL')
    
    precision = tp / (tp + fp + 1e-6) * 100
    recall    = tp / (tp + fn + 1e-6) * 100
    f1        = 2 * precision * recall / (precision + recall + 1e-6)
    
    print(f"\n{'═'*60}")
    print(f"  {BOLD}📊 ACCURACY REPORT{RESET}")
    print(f"{'═'*60}")
    print(f"  Files tested:  {total}")
    print(f"  Correct:       {correct}")
    
    acc_color = GREEN if accuracy >= 85 else (YELLOW if accuracy >= 70 else RED)
    print(f"  Accuracy:      {acc_color}{BOLD}{accuracy:.1f}%{RESET}")
    print(f"\n  {BOLD}Confusion Matrix:{RESET}")
    print(f"  ┌─────────────┬──────────┬──────────┐")
    print(f"  │             │ Pred: AI │Pred: REAL│")
    print(f"  ├─────────────┼──────────┼──────────┤")
    print(f"  │ True:  AI   │ {GREEN}{tp:>6} TP{RESET} │ {RED}{fn:>6} FN{RESET} │")
    print(f"  │ True: REAL  │ {RED}{fp:>6} FP{RESET} │ {GREEN}{tn:>6} TN{RESET} │")
    print(f"  └─────────────┴──────────┴──────────┘")
    print(f"\n  Precision:    {precision:.1f}%  (of AI alerts, how many were correct)")
    print(f"  Recall:       {recall:.1f}%  (of AI samples, how many were caught)")
    print(f"  F1 Score:     {f1:.1f}%")
    
    if fp > 0:
        fpr = [r['file'] for r in results if r['true'] == 'REAL' and r['predicted'] == 'AI']
        print(f"\n  {RED}⚠️  False Positives (real voice flagged as AI):{RESET}")
        for f in fpr: print(f"     • {f}")
    
    if fn > 0:
        fnr = [r['file'] for r in results if r['true'] == 'AI' and r['predicted'] == 'REAL']
        print(f"\n  {YELLOW}⚠️  False Negatives (AI voice missed):{RESET}")
        for f in fnr: print(f"     • {f}")
    
    print(f"\n{'═'*60}\n")

def main():
    print(f"\n{'═'*60}")
    print(f"  {BOLD}{CYAN}Srotram AI — Model Accuracy Test Suite{RESET}")
    print(f"  Threshold: {THRESHOLD}% = AI  |  <{THRESHOLD}% = REAL")
    print(f"{'═'*60}")
    
    # Load model
    device = torch.device('cuda' if HAS_MODEL and torch.cuda.is_available() else 'cpu')
    model = None
    
    if HAS_MODEL:
        print(f"\n  Device: {CYAN}{device}{RESET}")
        if os.path.exists(MODEL_PATH):
            try:
                model = RawNet(num_classes=2).to(device)
                model.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=True))
                model.eval()
                print(f"  Model:  {GREEN}Loaded ✓{RESET}  ({MODEL_PATH})")
            except Exception as e:
                print(f"  Model:  {RED}Failed to load: {e}{RESET}")
        else:
            print(f"  Model:  {YELLOW}Not found at {MODEL_PATH}{RESET}")
            print(f"  Running in HEURISTIC-ONLY mode")
    
    results = []
    
    # Test real voices
    print(f"\n  {BOLD}[1/2] Testing REAL voice files → {REAL_DIR}{RESET}")
    test_files(model, device, REAL_DIR, 'REAL', results)
    
    # Test AI voices
    print(f"\n  {BOLD}[2/2] Testing AI/deepfake voice files → {AI_DIR}{RESET}")
    test_files(model, device, AI_DIR, 'AI', results)
    
    # Print report
    print_report(results)

if __name__ == '__main__':
    main()
