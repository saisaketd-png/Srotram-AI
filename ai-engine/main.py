import os
import re
import sys
import time
import numpy as np
try:
    import torch
    HAS_TORCH = True
    TORCH_IMPORT_ERROR = None
except Exception as _torch_err:
    torch = None
    HAS_TORCH = False
    TORCH_IMPORT_ERROR = str(_torch_err)
    print(f"[WARN] Torch unavailable. Switching to heuristic-only mode: {_torch_err}", flush=True)

sys.path.append(os.path.join(os.path.dirname(__file__), "rawnet"))
try:
    from model import RawNet
    HAS_RAWNET = False # DISABLED LOCALLY TO SPEED UP SYSTEM
except Exception as _e:
    HAS_RAWNET = False
    print(f"[WARN] Cannot import RawNet: {_e}", flush=True)

try:
    from advanced_heuristics import AdvancedAudioHeuristics
except Exception as _e:
    AdvancedAudioHeuristics = None
    print(f"[WARN] Cannot import AdvancedAudioHeuristics: {_e}", flush=True)

try:
    from faster_whisper import WhisperModel
    HAS_WHISPER = True
except Exception as _w_err:
    HAS_WHISPER = False
    print(f"[WARN] Cannot import faster_whisper: {_w_err}", flush=True)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Srotram AI Engine", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─────────────────────────────────────────────────────────────────
# ENGINE
# ─────────────────────────────────────────────────────────────────
class SrotramEngine:
    def __init__(self):
        self.device = torch.device("cuda" if HAS_TORCH and torch.cuda.is_available() else "cpu") if HAS_TORCH else "cpu"
        self.model = None
        self.model_version = "No-Model"
        self.use_fp16 = HAS_TORCH and getattr(self.device, "type", "cpu") == "cuda"
        self.last_inference_ms = 0.0
        self.last_latency_ms = 0.0
        self.last_risk_score = 0.0
        self.last_nlp_score = 0.0
        self.last_physics_score = 0.0
        self.last_neural_score = 0.0
        
        self.advanced_heuristics = AdvancedAudioHeuristics(sample_rate=16000) if AdvancedAudioHeuristics else None

        # Initialize STT transcriber
        self.whisper = None
        if HAS_WHISPER:
            try:
                # tiny.en is extremely fast for edge environments
                compute_type = "float16" if self.use_fp16 else "int8"
                self.whisper = WhisperModel("tiny.en", device=str(self.device).split(':')[0], compute_type=compute_type)
                print("[OK] Loaded Faster-Whisper (tiny.en)")
            except Exception as e:
                print(f"[WARN] Failed to load Whisper: {e}")

        self._load_model()

    # ── logging ──────────────────────────────────────────────────
    def log(self, msg):
        print(msg, flush=True)

    # ── model loading ────────────────────────────────────────────
    def _load_model(self):
        if not HAS_TORCH:
            self.log(f"[WARN] Torch import blocked/unavailable: {TORCH_IMPORT_ERROR}")
            self.log("[WARN] Neural model disabled. Engine running in Physics-Heuristic mode.")
            return
        if not HAS_RAWNET:
            self.log("[WARN] RawNet not importable. No neural inference available.")
            return
        path = os.path.join(os.path.dirname(__file__), "rawnet", "rawnet_finetuned.pt")
        if not os.path.exists(path):
            self.log(f"[WARN] Model weights not found at: {path}")
            return
        try:
            self.model = RawNet(num_classes=2).to(self.device)
            self.model.load_state_dict(
                torch.load(path, map_location=self.device, weights_only=True)
            )
            self.model.eval()
            if self.use_fp16:
                self.model.half()
            if hasattr(torch, "compile"):
                try:
                    self.model = torch.compile(self.model, mode="reduce-overhead")
                    self.log("[OK] torch.compile enabled for local GPU optimization")
                except Exception as compile_err:
                    self.log(f"[WARN] torch.compile unavailable: {compile_err}")
            self.model_version = "RawNet-v2-Finetuned"
            self.log(f"[OK] Neural model loaded on {self.device} — {self.model_version}")
        except Exception as e:
            self.log(f"[ERR] Model load failed: {e}")
            self.model = None

    # ── decode Float32/Int16 PCM bytes ───────────────────────────
    def _decode(self, raw: bytes) -> np.ndarray:
        try:
            a = np.frombuffer(raw, dtype=np.float32).copy()
            if len(a) > 0 and np.max(np.abs(a)) <= 2.0:
                return a  # valid float32 PCM in [-1, 1]
        except Exception:
            pass
        try:
            return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        except Exception:
            return np.array([], dtype=np.float32)

    # ── resample to 16kHz ────────────────────────────────────────
    def _resample(self, audio: np.ndarray, src_sr: int) -> np.ndarray:
        if src_sr == 16000 or src_sr <= 0:
            return audio
        n_out = int(len(audio) * 16000 / src_sr)
        return np.interp(
            np.linspace(0, len(audio), n_out),
            np.arange(len(audio)),
            audio
        ).astype(np.float32)

    # ── neural inference — always called, returns 5 values ───────
    def _infer(self, audio: np.ndarray) -> dict | None:
        """
        Run forward_full() to get:
          fake_prob   — primary deepfake probability (0–100)
          acoustic    — spectral texture layer score
          behavioral  — temporal variance layer score
          language    — mel-band distribution layer score
          fingerprint — classifier certainty layer score
        """
        if self.model is None:
            return None
        try:
            dtype = torch.float16 if self.use_fp16 else torch.float32
            inp = torch.tensor(audio, dtype=dtype, device=self.device).unsqueeze(0).unsqueeze(0)
            t0 = time.perf_counter()
            with torch.no_grad():
                if self.use_fp16:
                    with torch.autocast(device_type="cuda", dtype=torch.float16):
                        logits, layer_scores = self.model.forward_full(inp)
                else:
                    logits, layer_scores = self.model.forward_full(inp)
            self.last_inference_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            self.log(
                f"[NEURAL] fake={layer_scores['fake_prob']:.1f}% "
                f"acoustic={layer_scores['acoustic']} "
                f"behavioral={layer_scores['behavioral']} "
                f"language={layer_scores['language']} "
                f"fingerprint={layer_scores['fingerprint']} "
                f"inference={self.last_inference_ms}ms"
            )
            return layer_scores
        except Exception as e:
            self.log(f"[NEURAL ERR] {e}")
            return None

    def _extract_demo_mode(self, headers: dict) -> int:
        raw_mode = str(headers.get("x-demo-mode", "0")).strip().lower()
        if raw_mode in {"true", "1", "mode1"}:
            return 1
        if raw_mode in {"2", "mode2"}:
            return 2
        try:
            parsed = int(raw_mode)
            if parsed in (0, 1, 2):
                return parsed
        except Exception:
            pass
        return 0

    def _clamp_score(self, value: float) -> float:
        return round(float(np.clip(value, 0.0, 99.0)), 2)

    def _score_nlp_text(self, text: str) -> float:
        """
        Light-weight deterministic NLP risk from urgency + financial patterns.
        This keeps scoring mathematically derived in fully local mode.
        """
        if not text:
            return 0.0
        normalized = re.sub(r"\s+", " ", text.lower()).strip()
        urgency_hits = len(re.findall(r"\b(urgent|immediately|now|quick|asap|today|emergency)\b", normalized))
        pressure_hits = len(re.findall(r"\b(don'?t tell|secret|confidential|act fast|limited time)\b", normalized))
        finance_hits = len(re.findall(r"\b(bank|upi|account|otp|password|transfer|payment|card|wallet|loan|refund)\b", normalized))
        authority_hits = len(re.findall(r"\b(police|court|income tax|officer|kyc|verification)\b", normalized))
        token_count = max(1, len(normalized.split(" ")))
        weighted = (urgency_hits * 1.2) + (pressure_hits * 1.3) + (finance_hits * 1.5) + (authority_hits * 1.0)
        density = weighted / token_count
        # Exponential compression to avoid saturation on longer text.
        score = 100.0 * (1.0 - np.exp(-5.0 * density))
        return self._clamp_score(score)

    # ── main analysis entry point ─────────────────────────────────
    def analyze(self, raw_bytes: bytes, headers: dict) -> dict:
        t0 = time.perf_counter()
        demo_mode = self._extract_demo_mode(headers)

        # ── decode ────────────────────────────────────────────────
        audio = self._decode(raw_bytes)
        self.log(f"[DECODE] raw_bytes={len(raw_bytes)} samples={len(audio)}")

        if len(audio) < 512:
            self.log("[SKIP] Too few samples")
            return self._empty()

        # ── resample to 16 kHz ────────────────────────────────────
        try:
            src_sr = int(headers.get("x-sample-rate", "16000"))
        except Exception:
            src_sr = 16000
        audio = self._resample(audio, src_sr)

        rms  = float(np.sqrt(np.mean(audio ** 2)))
        peak = float(np.max(np.abs(audio)))
        self.log(f"[AUDIO] samples={len(audio)} rms={rms:.6f} peak={peak:.6f} src_sr={src_sr}")

        # ── 1. Standard Normalization (MATCH TRAINING MATH) ────────
        # Removed the "Noise Gate" (np.where) because zeroing out audio chunks 
        # creates harsh digital jagged edges in the waveform, which the CNN 
        # correctly identified as 99.9% synthetic digital manipulation!
        std_val = np.std(audio)
        if std_val > 1e-6:
            norm_audio = (audio - np.mean(audio)) / std_val
        else:
            norm_audio = audio

        # ── 3. Padding / Windowing (MATCH TRAINING SHAPE) ──────────────────────
        MAX_LEN = 48000 # 3.0 seconds at 16kHz
        if len(norm_audio) > MAX_LEN:
            # Instead of taking the first 3 seconds (which might be silence),
            # find the 3-second window with the highest vocal energy (RMS).
            best_start = 0
            best_rms = 0
            step = 16000 # 1-second steps
            for i in range(0, len(norm_audio) - MAX_LEN + 1, step):
                window = norm_audio[i:i+MAX_LEN]
                window_rms = np.mean(window ** 2)
                if window_rms > best_rms:
                    best_rms = window_rms
                    best_start = i
            final_audio = norm_audio[best_start:best_start+MAX_LEN]
        else:
            final_audio = np.pad(norm_audio, (0, MAX_LEN - len(norm_audio)), 'constant')

        # ── TRANSCRIBE UPLOADED FILES ──────────────────────────────
        text_hint = str(headers.get("x-transcript", "") or headers.get("x-text", "")).strip()
        upload_source = str(headers.get("x-upload-source", "")).strip()
        if upload_source == "file" and self.whisper and len(audio) > 8000:
            try:
                self.log("[STT] Transcribing uploaded file audio...")
                segments, info = self.whisper.transcribe(audio, beam_size=1)
                text_hint = " ".join([segment.text for segment in segments])
                self.log(f"[STT] Transcript: {text_hint}")
            except Exception as e:
                self.log(f"[WARN] STT failed: {e}")

        # ── ADVANCED HEURISTICS (NEW DEEPFAKE MODEL) ──────────────
        if self.advanced_heuristics:
            adv = self.advanced_heuristics.evaluate_all(audio)
            acoustic = adv["acoustic"]
            behavioral = adv["behavioral"]
            language = adv["language"]
            fingerprint = adv["fingerprint"]
            adv_prob = adv["synthetic_prob"]
        else:
            # Fallback if library failed to load
            acoustic = 50.0
            behavioral = 50.0
            language = 50.0
            fingerprint = 50.0
            adv_prob = 50.0

        # ── RAWNET INFERENCE (BACKUP) ─────────────────────────────
        nn = self._infer(final_audio)
        replay_score = self._heuristic_replay_attack(audio)

        if nn is not None:
            # We use RawNet strictly as a secondary backup feature layer now.
            fake_prob = float(nn["fake_prob"])
            
            # Blend Advanced Heuristics (60%) with RawNet (40%)
            neural_score = self._clamp_score((fake_prob * 0.4) + (adv_prob * 0.6))
            physics_score = self._clamp_score(replay_score)

            # Do not overwrite text_hint if Whisper successfully transcribed it!
            if not text_hint and "x-transcript" in headers:
                text_hint = str(headers.get("x-transcript", "")).strip()
                
            nlp_score = self._score_nlp_text(text_hint)
            if "x-nlp-score" in headers and float(headers.get("x-nlp-score", "0")) > 0:
                try:
                    nlp_score = self._clamp_score(float(headers.get("x-nlp-score", "0")))
                except Exception:
                    pass

            # True mathematical Triad Fusion without ANY demo overrides
            risk = self._clamp_score((neural_score * 0.6) + (physics_score * 0.2) + (nlp_score * 0.2))
            source = "Fusion V2 (Adv.Heuristics 0.6 + RawNet 0.4)"

            self.last_neural_score = neural_score
            self.last_physics_score = physics_score
            self.last_nlp_score = nlp_score
            model_called = True
            neural_mode = "fusion_v2_full"
        else:
            # Model unavailable — fall back to physics
            self.log("[FALLBACK] No neural model — using physics heuristics")
            physics_score = self._clamp_score(replay_score)
            
            if not text_hint and "x-transcript" in headers:
                text_hint = str(headers.get("x-transcript", "")).strip()
            nlp_score = self._score_nlp_text(text_hint)
            
            neural_proxy = self._clamp_score(adv_prob)
            risk = self._clamp_score((neural_proxy * 0.6) + (physics_score * 0.2) + (nlp_score * 0.2))
            fake_prob = neural_proxy
            source = "Fusion V2 (Adv.Heuristics + NLP)"
            self.last_neural_score = neural_proxy
            self.last_physics_score = physics_score
            self.last_nlp_score = nlp_score
            model_called = False
            neural_mode = "advanced_fallback"


        # ── XAI ───────────────────────────────────────────────────
        emotion = "flat" if rms < 0.01 else ("anxious" if rms > 0.05 else "neutral")
        if rms < 1e-5:
            xai = f"[LOW SIGNAL] RMS={rms:.6f} — check Windows mic. Neural still ran: fake_prob={fake_prob:.1f}%"
        elif risk > 75:
            xai = f"SYNTHETIC DETECTED | {source} | fake={fake_prob:.1f}% | A={acoustic} B={behavioral} L={language} F={fingerprint}"
        elif risk > 50:
            xai = f"SUSPICIOUS | {source} | fake={fake_prob:.1f}% | A={acoustic} B={behavioral} L={language} F={fingerprint}"
        else:
            xai = f"HUMAN VOICE | {source} | fake={fake_prob:.1f}% | A={acoustic} B={behavioral} L={language} F={fingerprint}"

        ms = round((time.perf_counter() - t0) * 1000.0, 2)
        self.last_latency_ms = ms
        self.last_risk_score = risk
        if self.last_inference_ms <= 0:
            self.last_inference_ms = ms
        self.log(f"[RESULT] risk={risk}% source={source} inference={self.last_inference_ms}ms latency={ms}ms")

        return {
            "risk_score":       risk,
            "acoustic_score":   acoustic,
            "behavioral_score": behavioral,
            "nlp_score":        self.last_nlp_score,
            "network_score":    fingerprint,
            "emotion":          {"current": emotion},
            "xai_report":       xai,
            "transcript":       text_hint,
            "inference_ms":     self.last_inference_ms,
            "latency_ms":       ms,
            "audio_bytes":      len(raw_bytes),
            "model_version":    self.model_version,
            "fusion": {
                "neural_score": self.last_neural_score,
                "physics_score": self.last_physics_score,
                "nlp_score": self.last_nlp_score,
                "weights": {"neural": 0.6, "physics": 0.2, "nlp": 0.2},
                "demo_mode": demo_mode
            },
            "audit": {
                "model_called": model_called,
                "neural_mode": neural_mode,
                "final_decision_source": "fusion_weighted_sum",
                "neural_contribution_pct": 60,
                "physics_contribution_pct": 20,
                "nlp_contribution_pct": 20,
                "neural_fake_prob": round(float(fake_prob), 2)
            }
        }

    # ── physics fallbacks (only used if model fails to load) ─────
    
    def _heuristic_replay_attack(self, a):
        if len(a) < 1000: return 50.0
        
        fft = np.abs(np.fft.rfft(a))
        n = len(fft)
        if n < 100: return 50.0
        
        hz_per_bin = 8000.0 / n
        bass_bins = max(1, int(300 / hz_per_bin))
        treble_bins = min(n-1, int(4000 / hz_per_bin))
        
        bass_energy = float(np.mean(fft[:bass_bins]))
        mid_energy = float(np.mean(fft[bass_bins:treble_bins]))
        treble_energy = float(np.mean(fft[treble_bins:]))
        
        if mid_energy < 1e-6: return 50.0
        
        bass_ratio = bass_energy / mid_energy
        treble_ratio = treble_energy / mid_energy
        
        # ── THE MAGIC THRESHOLD ──
        # Humans speaking into a mic create the "Proximity Effect" (bass_ratio > 1.0).
        # Phone speakers physically cannot push enough air to do this (bass_ratio < 0.8).
        if bass_ratio < 0.9 or treble_ratio < 0.15:
            return 95.0 # High risk (AI Replay Attack)
        return 12.0 # Low risk (Real human voice)

    def _heuristic_acoustic(self, a):
        # Downsample to max 8000 samples for speed
        if len(a) > 8000: a = a[::len(a)//8000]
        SR, score = 16000, 50.0
        norm = a / (np.max(np.abs(a)) + 1e-9)
        if len(norm) < 4800: return score
        periods = []
        for i in range(0, len(norm)-800, 400):
            f = norm[i:i+800]
            if np.max(np.abs(f)) < 0.05: continue
            ac = np.correlate(f, f, 'full')[len(f)-1:]
            lo, hi = int(SR/400), int(SR/50)
            if hi < len(ac): periods.append(int(np.argmax(ac[lo:hi])) + lo)
        if len(periods) > 3:
            j = float(np.std(periods) / (np.mean(periods) + 1e-9))
            score = 85.0 if j < 0.02 else (60.0 if j < 0.05 else 20.0)
        return round(min(99, max(5, score)), 1)

    def _heuristic_behavioral(self, a):
        if len(a) > 8000: a = a[::len(a)//8000]
        norm = a / (np.max(np.abs(a)) + 1e-9)
        e = np.abs(norm)
        if len(e) < 3200: return 50.0
        env = np.array([np.mean(e[i:i+800]) for i in range(0, len(e)-800, 200)])
        if len(env) < 3: return 50.0
        d = float(np.std(env) / (np.mean(env) + 1e-9))
        return round(min(99, max(5, 80.0 if d < 0.15 else (55.0 if d < 0.35 else 20.0))), 1)

    def _heuristic_language(self, a):
        if len(a) > 8000: a = a[::len(a)//8000]
        norm = a / (np.max(np.abs(a)) + 1e-9)
        fft = np.abs(np.fft.rfft(norm)); n = len(fft)
        if n < 30: return 40.0
        hpb = (16000/2) / n
        cuts = [0,int(500/hpb),int(1000/hpb),int(2000/hpb),int(4000/hpb),n]
        be = [float(np.mean(fft[cuts[j]:min(cuts[j+1],n)])) for j in range(len(cuts)-1) if cuts[j]<min(cuts[j+1],n)]
        if len(be) < 4: return 40.0
        t = sum(be)+1e-9; ratios = [e/t for e in be]; exp = 1/len(ratios)
        u = float(np.clip(1.0-np.std(ratios)/(exp+1e-9),0,1))
        return round(min(99, max(5, u*70.0)), 1)

    def _heuristic_fingerprint(self, a):
        if len(a) > 8000: a = a[::len(a)//8000]
        norm = a / (np.max(np.abs(a)) + 1e-9)
        e = np.abs(norm)
        sr = float(np.sum(e < 0.05) / len(e))
        if len(e) < 3200 or sr < 0.05: return 40.0
        sil = e[e < 0.10]
        if len(sil) < 100: return 40.0
        nf = float(np.std(sil))
        return round(min(99, max(5, 75.0 if nf < 0.005 else (50.0 if nf < 0.02 else 20.0))), 1)

    def _heuristic_synthetic_signature(self, a):
        """
        Synthetic speech tends to be over-regular:
        - low variance in spectral centroid trajectory
        - highly stable short-term zero-crossing rate
        - unnaturally smooth energy envelope
        Returns higher scores for likely synthetic audio.
        """
        if len(a) < 3200:
            return 50.0

        x = a.astype(np.float32)
        x = x / (np.max(np.abs(x)) + 1e-9)

        frame = 512
        hop = 160
        if len(x) < frame + hop:
            return 50.0

        centroids = []
        zcrs = []
        energies = []
        freqs = np.fft.rfftfreq(frame, d=1.0 / 16000.0)
        for i in range(0, len(x) - frame, hop):
            f = x[i:i+frame]
            mag = np.abs(np.fft.rfft(f)) + 1e-9
            centroid = float(np.sum(freqs * mag) / np.sum(mag))
            zcr = float(np.mean(np.abs(np.diff(np.signbit(f)))))
            eng = float(np.sqrt(np.mean(f ** 2)))
            centroids.append(centroid)
            zcrs.append(zcr)
            energies.append(eng)

        if len(centroids) < 4:
            return 50.0

        c_var = float(np.std(centroids) / (np.mean(centroids) + 1e-9))
        z_var = float(np.std(zcrs) / (np.mean(zcrs) + 1e-9))
        e_var = float(np.std(energies) / (np.mean(energies) + 1e-9))

        # Lower variance => more synthetic-like
        c_risk = float(np.clip((0.35 - c_var) / 0.35, 0.0, 1.0))
        z_risk = float(np.clip((0.30 - z_var) / 0.30, 0.0, 1.0))
        e_risk = float(np.clip((0.45 - e_var) / 0.45, 0.0, 1.0))

        score = (c_risk * 0.4 + z_risk * 0.3 + e_risk * 0.3) * 100.0
        return round(min(99.0, max(5.0, score)), 1)

    def _empty(self):
        return {
            "risk_score": 0, "acoustic_score": 0, "behavioral_score": 0,
            "nlp_score": 0, "network_score": 0, "emotion": {"current": "neutral"},
            "xai_report": "Waiting for audio — check mic volume in Windows Sound Settings",
            "inference_ms": 0.0,
            "latency_ms": 0.0,
            "fusion": {
                "neural_score": 0.0,
                "physics_score": 0.0,
                "nlp_score": 0.0,
                "weights": {"neural": 0.6, "physics": 0.2, "nlp": 0.2},
                "demo_mode": 0
            },
            "audit": {
                "model_called": False,
                "neural_mode": "no_audio",
                "final_decision_source": "none",
                "neural_contribution_pct": 60,
                "physics_contribution_pct": 20,
                "nlp_contribution_pct": 20
            }
        }


# ─────────────────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────────────────
print("=== Srotram AI Neural Engine v4.0 starting ===", flush=True)
engine = SrotramEngine()
print(f"=== Ready | model={engine.model_version} | device={engine.device} ===", flush=True)


# ─────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":       "ok",
        "model":        engine.model_version,
        "device":       str(engine.device),
        "neural_ready": engine.model is not None,
        "torch_ready": HAS_TORCH,
        "torch_error": TORCH_IMPORT_ERROR
    }

@app.get("/telemetry")
async def telemetry():
    gpu_active = HAS_TORCH and torch.cuda.is_available()
    vram_used = 0.0
    vram_total = 0.0
    utilization = 0.0
    gpu_name = "CPU"
    if gpu_active:
        gpu_name = torch.cuda.get_device_name(0)
        props = torch.cuda.get_device_properties(0)
        vram_total = round(props.total_memory / (1024 ** 3), 2)
        vram_used = round(torch.cuda.memory_allocated(0) / (1024 ** 3), 2)
        if vram_total > 0:
            utilization = round((vram_used / vram_total) * 100.0, 2)
    return {
        "gpu": {
            "name": gpu_name,
            "active": gpu_active,
            "vram_used_gb": vram_used,
            "vram_total_gb": vram_total,
            "utilization_pct": utilization
        },
        "status": "operational",
        "model": engine.model_version,
        "latest": {
            "risk_score": engine.last_risk_score,
            "inference_ms": engine.last_inference_ms,
            "latency_ms": engine.last_latency_ms
        }
    }

@app.post("/analyze")
async def analyze(request: Request):
    try:
        raw   = await request.body()
        if not raw:
            return engine._empty()
        hdrs  = dict(request.headers)
        result = engine.analyze(raw, hdrs)

        def fix(o):
            if isinstance(o, np.generic): return o.item()
            if isinstance(o, dict):       return {k: fix(v) for k, v in o.items()}
            if isinstance(o, list):       return [fix(i) for i in o]
            return o
        return fix(result)
    except Exception as e:
        print(f"[ROUTE ERR] {e}", flush=True)
        import traceback; traceback.print_exc()
        return engine._empty()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
