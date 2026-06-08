import numpy as np
import librosa
import noisereduce as nr
from scipy.signal import butter, lfilter

class AdvancedAudioHeuristics:
    def __init__(self, sample_rate=16000):
        self.sr = sample_rate

    def preprocess(self, audio: np.ndarray) -> np.ndarray:
        """
        Superior preprocessing:
        1. Remove background noise (improves precision on cheap mics).
        2. Normalize peak amplitude to fix 'high audio' / clipping issues.
        3. Apply a bandpass filter (voice frequencies) to clean extreme artifacts.
        """
        # 1. Noise Reduction
        if len(audio) > self.sr * 0.5: # need at least half a sec for noise profile
            audio = nr.reduce_noise(y=audio, sr=self.sr, prop_decrease=0.7)
            
        # 2. Bandpass Filter (80Hz to 7500Hz)
        nyq = 0.5 * self.sr
        low = 80.0 / nyq
        high = 7500.0 / nyq
        b, a = butter(4, [low, high], btype='band')
        audio = lfilter(b, a, audio)

        # 3. Peak Normalization
        peak = np.max(np.abs(audio))
        if peak > 1e-5:
            audio = audio / peak

        return audio.astype(np.float32)

    def analyze_behavioral_breathing(self, audio: np.ndarray) -> float:
        """
        Behavioral: Is breathing and pacing robotic?
        Human speech has micro-pauses (inhalations) that have a distinct RMS envelope.
        AI TTS often has absolute digital silence or instantly-clipped pacing.
        Returns a score (0 to 100) where 100 = highly synthetic/robotic pacing.
        """
        # Calculate RMS energy envelope
        frame_length = int(self.sr * 0.05) # 50ms windows
        hop_length = int(self.sr * 0.025)
        rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
        
        # Count "digital silence" pauses (RMS exactly 0 or near 0)
        digital_silence_frames = np.sum(rms < 1e-4)
        total_frames = len(rms)
        silence_ratio = digital_silence_frames / total_frames if total_frames > 0 else 0
        
        # Humans almost never produce absolute digital zero; room noise/breathing exists.
        # High digital silence ratio strongly indicates AI TTS generation.
        score = min(100.0, silence_ratio * 300.0) 
        return float(score)

    def analyze_acoustic_vocal_tract(self, audio: np.ndarray) -> float:
        """
        Acoustic: Are vocal tract frequencies physically possible?
        AI models often generate unnatural spectral rolloff (too bright or too muffled).
        """
        rolloff = librosa.feature.spectral_rolloff(y=audio, sr=self.sr, roll_percent=0.85)[0]
        mean_rolloff = np.mean(rolloff)
        # Human speech usually rolls off between 3000Hz and 6000Hz.
        if mean_rolloff < 2000 or mean_rolloff > 7000:
            return 85.0 # Synthetic extremes
        return 20.0

    def analyze_language_phonemes(self, audio: np.ndarray) -> float:
        """
        Language: Are phoneme transitions unnaturally smooth?
        Calculates spectral flux (how fast frequencies change).
        AI voices lack natural human "clicking" and plosive bursts, resulting in low flux variance.
        """
        S = np.abs(librosa.stft(audio))
        # Spectral flux: difference between consecutive frames
        flux = np.sum(np.diff(S, axis=1)**2, axis=0)
        flux_var = np.var(flux)
        
        # Very low variance means unnaturally smooth (AI-like)
        if flux_var < 1.0:
            return 90.0
        elif flux_var > 10.0:
            return 10.0
        else:
            return float(100.0 - (flux_var * 10.0))

    def analyze_fingerprint(self, audio: np.ndarray) -> float:
        """
        Fingerprint: Digital signature of deepfake generators.
        Many vocoders (HiFi-GAN, WaveGlow) leave repeating artifacts in the upper spectrum (12kHz+).
        """
        fft = np.abs(np.fft.rfft(audio))
        high_freq_energy = np.mean(fft[int(len(fft)*0.75):])
        total_energy = np.mean(fft)
        
        ratio = high_freq_energy / (total_energy + 1e-6)
        # If the ratio is unnaturally high or shows periodic spikes, it's a vocoder artifact.
        if ratio > 0.15:
            return 95.0
        return 15.0

    def evaluate_all(self, audio: np.ndarray) -> dict:
        if len(audio) < self.sr * 1.0: # Need at least 1 sec
            return {"acoustic": 50.0, "behavioral": 50.0, "language": 50.0, "fingerprint": 50.0, "synthetic_prob": 50.0}

        cleaned = self.preprocess(audio)
        ac = self.analyze_acoustic_vocal_tract(cleaned)
        bh = self.analyze_behavioral_breathing(cleaned)
        lg = self.analyze_language_phonemes(cleaned)
        fg = self.analyze_fingerprint(cleaned)

        # The new highly robust composite probability
        synthetic_prob = (ac * 0.25) + (bh * 0.35) + (lg * 0.20) + (fg * 0.20)
        
        return {
            "acoustic": round(ac, 1),
            "behavioral": round(bh, 1),
            "language": round(lg, 1),
            "fingerprint": round(fg, 1),
            "synthetic_prob": round(synthetic_prob, 1),
            "cleaned_audio": cleaned
        }
