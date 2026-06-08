import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from model import RawNet
import soundfile as sf
import time
import random
from concurrent.futures import ThreadPoolExecutor
import gc

# ==========================================
# SROTRAM AI - SPECTROGRAM TRAINING
# ==========================================
MLAAD_DIR = "../../../MLAAD-tiny"
EPOCHS = 8
BATCH_SIZE = 32
LEARNING_RATE = 3e-4
MAX_AUDIO_LENGTH = 16000 * 3  # 3 seconds at 16kHz

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

class AudioDataset(Dataset):
    def __init__(self, root_dir, max_per_class=400):
        self.data = []
        real_paths = []
        fake_paths = []
        
        for r, d, f in os.walk(root_dir):
            for file in f:
                if not file.endswith(".wav"): continue
                path = os.path.join(r, file)
                if "original" in path.lower() or "bona-fide" in path.lower():
                    real_paths.append(path)
                elif "fake" in path.lower() or "spoof" in path.lower():
                    fake_paths.append(path)

        print(f"📊 Found {len(real_paths)} real, {len(fake_paths)} fake files")
        
        selected = random.sample(real_paths, min(len(real_paths), max_per_class)) + \
                   random.sample(fake_paths, min(len(fake_paths), max_per_class))
        random.shuffle(selected)

        print(f"🔥 Loading all {len(selected)} samples into RAM...")
        
        def load_one(p):
            try:
                audio, sr = sf.read(p, dtype='float32')
                if len(audio.shape) > 1: audio = audio[:, 0]
                if sr != 16000:
                    audio = np.interp(
                        np.linspace(0, len(audio), int(len(audio) * 16000 / sr)),
                        np.arange(len(audio)), audio
                    ).astype(np.float32)
                
                # ── Live Mic Augmentation (Prevents Overfitting) ──
                # 1. Random volume scaling (simulating distance from mic)
                audio = audio * random.uniform(0.3, 1.0)
                # 2. Add background room hiss/noise (simulating cheap mic)
                if random.random() > 0.5:
                    audio += np.random.normal(0, 0.005, len(audio)).astype(np.float32)

                audio = (audio - np.mean(audio)) / (np.std(audio) + 1e-6)
                if len(audio) > MAX_AUDIO_LENGTH:
                    audio = audio[:MAX_AUDIO_LENGTH]
                else:
                    audio = np.pad(audio, (0, MAX_AUDIO_LENGTH - len(audio)), 'constant')
                
                label = 0 if ("original" in p.lower() or "bona-fide" in p.lower()) else 1
                return (torch.FloatTensor(audio).unsqueeze(0), label)
            except:
                return None

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(load_one, selected))
        
        self.data = [r for r in results if r is not None]
        
        # Count class distribution
        n_real = sum(1 for _, l in self.data if l == 0)
        n_fake = sum(1 for _, l in self.data if l == 1)
        print(f"✅ Loaded: {len(self.data)} samples ({n_real} real, {n_fake} fake)")

    def __len__(self): return len(self.data)
    def __getitem__(self, i): return self.data[i]

def train():
    torch.cuda.empty_cache()
    
    print(f"🧠 Srotram AI: Spectrogram Training on {device}")
    print(f"   Architecture: Lightweight Mel-Spectrogram CNN (~200K params)")
    print(f"   Strategy: Fresh train on new architecture (old weights incompatible)")
    print()
    
    # Load entire dataset
    ds = AudioDataset(MLAAD_DIR)
    
    if len(ds) == 0:
        print(f"⚠️ No data found in {MLAAD_DIR}!")
        print("Please check the MLAAD_DIR path at the top of this file.")
        return
    
    loader = DataLoader(ds, batch_size=BATCH_SIZE, shuffle=True, pin_memory=True)
    
    model = RawNet(num_classes=2).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"   Model parameters: {total_params:,}")
    print()
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', patience=3, factor=0.5)
    
    best_acc = 0.0
    
    for epoch in range(EPOCHS):
        model.train()
        correct, total, running_loss = 0, 0, 0.0
        t0 = time.time()
        
        for i, (inputs, labels) in enumerate(loader):
            inputs, labels = inputs.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
            
            elapsed = time.time() - t0
            eta = (len(loader) - (i + 1)) * (elapsed / (i + 1))
            acc = 100 * correct / total
            print(f"   Ep {epoch+1}/{EPOCHS} | Batch {i+1}/{len(loader)} | Acc: {acc:.1f}% | Loss: {running_loss/(i+1):.4f} | ETA: {eta:.0f}s", end="\r")
        
        epoch_acc = 100 * correct / total
        epoch_loss = running_loss / len(loader)
        elapsed = time.time() - t0
        scheduler.step(epoch_acc)
        
        status = ""
        if epoch_acc > best_acc:
            best_acc = epoch_acc
            torch.save(model.state_dict(), "rawnet_finetuned.pt")
            status = " 💾 SAVED (New Best!)"
        
        print(f"\n   ✅ Epoch {epoch+1} | Acc: {epoch_acc:.1f}% | Loss: {epoch_loss:.4f} | Best: {best_acc:.1f}% | Time: {elapsed:.0f}s{status}")
    
    print(f"\n🏆 Training Complete! Best accuracy: {best_acc:.1f}%")
    print(f"   Model saved to rawnet_finetuned.pt")

if __name__ == "__main__":
    train()
