from faster_whisper import WhisperModel
import io
import numpy as np

class ScamDetector:
    def __init__(self, device="cuda"):
        # Use quantized tiny model for sub-100ms transcription
        self.model = WhisperModel("tiny.en", device=device, compute_type="float16")
        self.scam_keywords = {
            "Urgency": ["urgent", "immediately", "act now", "limited time", "hurry"],
            "Financial": ["wire transfer", "bank account", "gift card", "send money", "crypto"],
            "Impersonation": ["irs", "police", "social security", "microsoft support", "account compromised"]
        }
        print(f"💬 NLP Scam Detector Loaded (Whisper-Tiny FP16) on {device}")

    def analyze(self, audio_data):
        # Audio data is raw PCM float32
        audio = np.frombuffer(audio_data, dtype=np.float32)
        
        # Transcribe
        segments, info = self.model.transcribe(audio, beam_size=1)
        transcript = " ".join([s.text for s in segments]).lower()
        
        flags = []
        detected_phrases = []
        score = 0
        
        for category, keywords in self.scam_keywords.items():
            found = [k for k in keywords if k in transcript]
            if found:
                flags.append(category)
                detected_phrases.extend(found)
                score += 30
        
        return {
            "score": min(100, score),
            "flags": flags,
            "detected_phrases": detected_phrases,
            "transcript_snippet": transcript if transcript else "..."
        }
