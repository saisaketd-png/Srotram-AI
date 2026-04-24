import time, os, random
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import torch
import GPUtil

# Real Intelligence Layers
from app.layers.acoustic import AcousticEngine
from app.layers.nlp import ScamDetector

app = FastAPI(title="AegisVoice AI Engine (Production)", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Initialize Real Engines
device = "cuda" if torch.cuda.is_available() else "cpu"
acoustic_engine = AcousticEngine(device=device)
nlp_engine = ScamDetector(device=device)

def analyze_behavioral(audio_data):
    """Analyze speech rhythm for AI patterns (e.g. lack of breathing)"""
    audio = np.frombuffer(audio_data, dtype=np.float32)
    # Simple energy-based silence detection
    energy = np.abs(audio)
    silence_mask = energy < 0.02
    silence_ratio = np.mean(silence_mask)
    
    score = 0
    flags = []
    # AI generators often have unnaturally consistent or non-existent pauses
    if silence_ratio < 0.05:
        score = 65
        flags.append("Unnatural breathing intervals (robotic rhythm)")
    elif silence_ratio > 0.4:
        score = 40
        flags.append("Excessive processing delays")
        
    return {"score": score, "flags": flags}

def get_network_stats(jitter_header):
    """Simulated Network Fingerprinting based on incoming packet jitter"""
    jitter = float(jitter_header) if jitter_header else random.uniform(5, 15)
    is_voip = jitter > 25
    return {"score": 60 if is_voip else 10, "protocol": "VoIP/SIP" if is_voip else "PSTN", "jitter": jitter}

@app.get("/health")
async def health():
    gpus = GPUtil.getGPUs()
    gpu = gpus[0] if gpus else None
    return {
        "status": "operational",
        "gpu": {
            "name": gpu.name if gpu else "N/A",
            "vram_used": gpu.memoryUsed if gpu else 0,
            "vram_total": gpu.memoryTotal if gpu else 0,
            "utilization": gpu.load * 100 if gpu else 0
        },
        "models": ["RawNet3-FP16", "Whisper-Tiny-INT8"]
    }

@app.get("/telemetry")
async def telemetry():
    gpus = GPUtil.getGPUs()
    gpu = gpus[0] if gpus else None
    return {
        "gpu": {
            "name": gpu.name if gpu else "RTX 3040",
            "vram_used": gpu.memoryUsed if gpu else 0,
            "vram_total": gpu.memoryTotal if gpu else 0,
            "utilization": gpu.load * 100 if gpu else 0,
            "temperature": gpu.temperature if gpu else 0
        },
        "status": "operational"
    }

@app.post("/analyze")
async def analyze(request: Request):
    t0 = time.time()
    audio_data = await request.body()
    
    # 1. Acoustic Layer (RawNet3)
    acoustic = acoustic_engine.analyze(audio_data)
    
    # 2. NLP Layer (Whisper)
    nlp = nlp_engine.analyze(audio_data)
    
    # 3. Behavioral Layer (Rhythm)
    behavioral = analyze_behavioral(audio_data)
    
    # 4. Network Layer (Simulated)
    network = get_network_stats(request.headers.get("X-Jitter"))

    # Weighted Composite Score
    risk = (acoustic["score"] * 0.40 + nlp["score"] * 0.30 + behavioral["score"] * 0.20 + network["score"] * 0.10)
    
    # Generate XAI Report
    reports = []
    if acoustic["score"] > 50: reports.append(f"Acoustic anomaly: {', '.join(acoustic['artifacts'])}")
    if nlp["flags"]: reports.append(f"Scam indicators: {', '.join(nlp['flags'])}")
    if behavioral["flags"]: reports.append(f"Speech pattern: {', '.join(behavioral['flags'])}")
    
    inference_ms = round((time.time() - t0) * 1000, 1)

    return {
        "risk_score": round(risk, 1),
        "acoustic_score": acoustic["score"],
        "acoustic_artifacts": acoustic["artifacts"],
        "behavioral_score": behavioral["score"],
        "behavioral_flags": behavioral["flags"],
        "nlp_score": nlp["score"],
        "nlp_flags": nlp["flags"],
        "nlp_phrases": nlp["detected_phrases"],
        "transcript_snippet": nlp["transcript_snippet"],
        "network_score": network["score"],
        "network_protocol": network["protocol"],
        "network_jitter": network["jitter"],
        "xai_report": " | ".join(reports) if reports else "No major anomalies detected.",
        "inference_ms": inference_ms,
        "audio_bytes": len(audio_data),
        "model_version": "RawNet3+Whisper-v1.1"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
