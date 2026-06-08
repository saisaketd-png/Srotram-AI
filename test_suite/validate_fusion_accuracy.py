"""
Validate Srotram AI fusion behavior and model contribution.

Checks:
1) RawNet model is loaded/called in analyze().
2) Final decision comes from triad weighted fusion.
3) Accuracy metrics over MLAAD-tiny sample set.
"""

import os
import random
import sys
import wave
from typing import List, Tuple

import numpy as np


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AI_ENGINE_DIR = os.path.join(ROOT, "ai-engine")
DATASET_DIR = os.path.abspath(os.path.join(ROOT, "..", "MLAAD-tiny"))
SAMPLE_RATE = 16000
MODEL_THRESHOLD = 50.0
MAX_PER_CLASS = 120
SEED = 42

sys.path.insert(0, AI_ENGINE_DIR)
import main as engine_main  # noqa: E402


def gather_wavs(root_dir: str) -> List[str]:
    wavs = []
    for r, _, files in os.walk(root_dir):
        for fname in files:
            if fname.lower().endswith(".wav"):
                wavs.append(os.path.join(r, fname))
    wavs.sort()
    return wavs


def load_wav_16k_mono(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sample_width == 2:
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 4:
        audio = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        audio = np.frombuffer(raw, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

    if n_channels > 1:
        audio = audio.reshape(-1, n_channels).mean(axis=1)

    if sample_rate != SAMPLE_RATE:
        n_out = int(len(audio) * SAMPLE_RATE / sample_rate)
        audio = np.interp(
            np.linspace(0, len(audio), n_out),
            np.arange(len(audio)),
            audio,
        ).astype(np.float32)

    return audio


def evaluate_file(path: str, true_label: int) -> Tuple[bool, dict]:
    audio = load_wav_16k_mono(path)
    pcm_i16 = np.clip(audio, -1.0, 1.0)
    pcm_i16 = (pcm_i16 * 32767.0).astype(np.int16)
    raw = pcm_i16.tobytes()

    result = engine_main.engine.analyze(
        raw,
        {
            "x-sample-rate": str(SAMPLE_RATE),
            "x-demo-mode": "0",
            "x-transcript": "",
        },
    )

    predicted = 1 if float(result.get("risk_score", 0.0)) >= MODEL_THRESHOLD else 0
    correct = predicted == true_label
    return correct, result


def main():
    random.seed(SEED)
    np.random.seed(SEED)

    real_dir = os.path.join(DATASET_DIR, "original")
    fake_dir = os.path.join(DATASET_DIR, "fake")
    real_files = gather_wavs(real_dir)
    fake_files = gather_wavs(fake_dir)

    if not real_files or not fake_files:
        print("Dataset files not found. Expected .wav files under MLAAD-tiny/original and MLAAD-tiny/fake.")
        return

    real_pick = random.sample(real_files, min(MAX_PER_CLASS, len(real_files)))
    fake_pick = random.sample(fake_files, min(MAX_PER_CLASS, len(fake_files)))
    eval_set = [(p, 0) for p in real_pick] + [(p, 1) for p in fake_pick]
    random.shuffle(eval_set)

    total = 0
    correct = 0
    tp = fp = tn = fn = 0
    model_called_count = 0
    fusion_sourced_count = 0
    neural_influence_nonzero = 0

    for path, label in eval_set:
        ok, result = evaluate_file(path, label)
        total += 1
        if ok:
            correct += 1

        pred = 1 if float(result.get("risk_score", 0.0)) >= MODEL_THRESHOLD else 0
        if label == 1 and pred == 1:
            tp += 1
        elif label == 0 and pred == 0:
            tn += 1
        elif label == 0 and pred == 1:
            fp += 1
        elif label == 1 and pred == 0:
            fn += 1

        audit = result.get("audit", {})
        if audit.get("model_called"):
            model_called_count += 1
        if audit.get("final_decision_source") == "fusion_weighted_sum":
            fusion_sourced_count += 1

        fusion = result.get("fusion", {})
        if float(fusion.get("neural_score", 0.0)) > 0.0:
            neural_influence_nonzero += 1

    accuracy = (correct / total) * 100.0 if total else 0.0
    precision = (tp / (tp + fp)) * 100.0 if (tp + fp) else 0.0
    recall = (tp / (tp + fn)) * 100.0 if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    print("\n=== SROTRAM FUSION VALIDATION ===")
    print(f"Model version: {engine_main.engine.model_version}")
    print(f"Device: {engine_main.engine.device}")
    print(f"Samples tested: {total} ({len(real_pick)} real + {len(fake_pick)} fake)")
    print(f"Accuracy: {accuracy:.2f}%")
    print(f"Precision: {precision:.2f}%")
    print(f"Recall: {recall:.2f}%")
    print(f"F1: {f1:.2f}%")
    print(f"Confusion matrix: TP={tp}, FP={fp}, TN={tn}, FN={fn}")
    print("\n--- Decision Path Audit ---")
    print(f"model_called=True count: {model_called_count}/{total}")
    print(f"final_decision_source=fusion_weighted_sum count: {fusion_sourced_count}/{total}")
    print(f"non-zero neural_score count: {neural_influence_nonzero}/{total}")


if __name__ == "__main__":
    main()
