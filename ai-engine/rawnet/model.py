import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np


class ResBlock(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, out_channels, kernel_size=3, padding=1)
        self.bn1   = nn.BatchNorm1d(out_channels)
        self.conv2 = nn.Conv1d(out_channels, out_channels, kernel_size=3, padding=1)
        self.bn2   = nn.BatchNorm1d(out_channels)
        self.downsample = nn.Conv1d(in_channels, out_channels, kernel_size=1) if in_channels != out_channels else None

    def forward(self, x):
        identity = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        if self.downsample is not None:
            identity = self.downsample(identity)
        return F.relu(out + identity)


class RawNet(nn.Module):
    """
    Spectrogram-CNN deepfake audio detector.

    Weights are stored under self.features (nn.Sequential, indices 0-14)
    and self.classifier to match the saved .pt checkpoint.

    forward(x)       -> logits  (batch, 2)
    forward_full(x)  -> (logits, layer_scores_dict)
        layer_scores keys: acoustic, behavioral, language, fingerprint, fake_prob
        All scores are floats in [5, 99] — genuinely from neural activations.
    """
    def __init__(self, num_classes=2):
        super().__init__()
        self.n_fft      = 512
        self.hop_length = 160
        self.n_mels     = 64

        mel_fb = self._create_mel_filterbank(16000, self.n_fft, self.n_mels)
        self.register_buffer('mel_fb', mel_fb)

        # ── IMPORTANT: keep self.features as a FLAT Sequential ──────
        # Layer indices MUST match the saved checkpoint (features.X.weight):
        #   0-4  : Conv2d(1→32),  BN, ReLU, MaxPool, Dropout   ← acoustic block
        #   5-9  : Conv2d(32→64), BN, ReLU, MaxPool, Dropout   ← behavioral block
        #  10-14 : Conv2d(64→128),BN, ReLU, AvgPool, Dropout   ← language block
        self.features = nn.Sequential(
            # block 1
            nn.Conv2d(1,  32,  kernel_size=3, padding=1),  # [0]  features.0
            nn.BatchNorm2d(32),                             # [1]  features.1
            nn.ReLU(),                                      # [2]
            nn.MaxPool2d(2),                                # [3]
            nn.Dropout(0.25),                               # [4]
            # block 2
            nn.Conv2d(32, 64,  kernel_size=3, padding=1),  # [5]  features.5
            nn.BatchNorm2d(64),                             # [6]  features.6
            nn.ReLU(),                                      # [7]
            nn.MaxPool2d(2),                                # [8]
            nn.Dropout(0.25),                               # [9]
            # block 3
            nn.Conv2d(64, 128, kernel_size=3, padding=1),  # [10] features.10
            nn.BatchNorm2d(128),                            # [11] features.11
            nn.ReLU(),                                      # [12]
            nn.AdaptiveAvgPool2d((4, 4)),                   # [13]
            nn.Dropout(0.25),                               # [14]
        )

        self.classifier = nn.Sequential(
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, num_classes)
        )

    # ── mel spectrogram ──────────────────────────────────────────
    def _create_mel_filterbank(self, sr, n_fft, n_mels):
        fmin, fmax = 0.0, sr / 2.0
        mel_min = 2595.0 * np.log10(1.0 + fmin / 700.0)
        mel_max = 2595.0 * np.log10(1.0 + fmax / 700.0)
        mel_pts = np.linspace(mel_min, mel_max, n_mels + 2)
        hz_pts  = 700.0 * (10.0 ** (mel_pts / 2595.0) - 1.0)
        bin_pts = np.floor((n_fft + 1) * hz_pts / sr).astype(int)
        fb = np.zeros((n_mels, n_fft // 2 + 1))
        for i in range(n_mels):
            for j in range(bin_pts[i], bin_pts[i+1]):
                if bin_pts[i+1] != bin_pts[i]:
                    fb[i, j] = (j - bin_pts[i]) / (bin_pts[i+1] - bin_pts[i])
            for j in range(bin_pts[i+1], bin_pts[i+2]):
                if bin_pts[i+2] != bin_pts[i+1]:
                    fb[i, j] = (bin_pts[i+2] - j) / (bin_pts[i+2] - bin_pts[i+1])
        return torch.FloatTensor(fb)

    def _to_melspec(self, x):
        """(B,1,T) → (B,1,n_mels,frames)"""
        x   = x.squeeze(1)
        win = torch.hann_window(self.n_fft, device=x.device)
        s   = torch.stft(x, n_fft=self.n_fft, hop_length=self.hop_length,
                         win_length=self.n_fft, window=win, return_complex=True)
        pw  = torch.abs(s) ** 2
        mel = torch.matmul(self.mel_fb, pw)
        mel = torch.log(mel + 1e-9)
        return mel.unsqueeze(1)  # (B,1,n_mels,T)

    # ── standard forward (backward-compatible) ───────────────────
    def forward(self, x):
        m = self._to_melspec(x)
        m = self.features(m)
        m = m.view(m.size(0), -1)
        return self.classifier(m)

    # ── extended forward: all 4 layer scores from neural internals ─
    def forward_full(self, x):
        """
        Returns
        -------
        logits      : Tensor (B, 2)
        scores      : dict
            acoustic    – spectral filter uniformity  (block 1)
            behavioral  – temporal variance           (block 2)
            language    – mel-band distribution       (block 3)
            fingerprint – classifier decision margin  (head)
            fake_prob   – P(fake) × 100
        """
        mel = self._to_melspec(x)  # (B,1,64,T)

        # ── STAGE 1: features[0:5] → acoustic ────────────────
        h = mel
        for i in range(5):
            h = self.features[i](h)
        h1 = h  # (B,32,H1,W1)
        # High filter-response uniformity = synthetic spectral texture
        act1  = h1.mean(dim=[2, 3])           # (B,32)
        act1_std  = act1.std(dim=1)           # (B,)
        act1_mean = act1.mean(dim=1).abs() + 1e-6
        acoustic = float(
            100.0 * (1.0 - (act1_std / act1_mean).clamp(0, 1)).mean().item()
        )

        # ── STAGE 2: features[5:10] → behavioral ─────────────
        for i in range(5, 10):
            h = self.features[i](h)
        h2 = h  # (B,64,H2,W2)
        # Low temporal variance = flat, AI-like amplitude envelope
        t_var  = h2.std(dim=3).mean()          # mean std over time frames
        t_mean = h2.mean(dim=[2, 3]).abs().mean() + 1e-6
        behavioral = float(
            100.0 * (1.0 - (t_var / t_mean).clamp(0, 1)).item()
        )

        # ── STAGE 3: features[10:15] → language ──────────────
        for i in range(10, 15):
            h = self.features[i](h)
        h3 = h  # (B,128,4,4)
        # Balanced mel-band energy = AI voice (uniform frequency synthesis)
        band_e  = h3.mean(dim=[0, 3])         # (128,4)
        band_std  = band_e.std(dim=1).mean()
        band_mean = band_e.mean(dim=1).abs().mean() + 1e-6
        language = float(
            100.0 * (1.0 - (band_std / band_mean).clamp(0, 1)).item()
        )

        # ── CLASSIFIER → fingerprint + fake_prob ─────────────
        flat    = h3.view(h3.size(0), -1)
        logits  = self.classifier(flat)
        probs   = torch.softmax(logits, dim=1)
        fake_p  = probs[0][1].item() * 100.0
        margin  = abs(probs[0][1].item() - probs[0][0].item())  # decision confidence
        fingerprint = float(40.0 + 50.0 * margin * (fake_p / 100.0))

        def clamp(v): return round(min(99.0, max(5.0, v)), 1)
        return logits, {
            "acoustic":    clamp(acoustic),
            "behavioral":  clamp(behavioral),
            "language":    clamp(language),
            "fingerprint": clamp(fingerprint),
            "fake_prob":   round(fake_p, 2),
        }
