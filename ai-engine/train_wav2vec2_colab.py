"""
SROTRAM AI - GOOGLE COLAB TRAINING SCRIPT
Latest Architecture: Wav2Vec2 Transformer Fine-tuning for Deepfake Audio Detection
"""

# ==========================================
# INSTRUCTIONS FOR GOOGLE COLAB
# ==========================================
# 1. Go to https://colab.research.google.com/
# 2. Click "File > New Notebook"
# 3. Go to "Runtime > Change runtime type" and select "T4 GPU"
# 4. Copy and paste ALL the code below into a cell and press Run.
# 5. Make sure you upload your dataset zip file to Colab or link your Google Drive.

# ==========================================
# DATASET UPLOAD INSTRUCTIONS
# ==========================================
# The best way to upload your dataset is via Google Drive.
# 
# 1. On your PC, organize your audio files into two folders exactly like this:
#    my_dataset/
#      ├── real/     <-- put your real human audio files here
#      └── fake/     <-- put your AI deepfake audio files here
#
# 2. Compress the 'my_dataset' folder into a zip file (my_dataset.zip).
# 3. Upload 'my_dataset.zip' to your Google Drive.
# 4. Uncomment the code below to mount your drive and unzip the dataset!

'''
from google.colab import drive
import zipfile
import os

print("📂 Mounting Google Drive...")
drive.mount('/content/drive')

print("📦 Unzipping dataset...")
with zipfile.ZipFile('/content/drive/MyDrive/my_dataset.zip', 'r') as zip_ref:
    zip_ref.extractall('/content/my_dataset')
print("✅ Dataset ready at /content/my_dataset")
'''

import os
import sys

# 1. Install necessary libraries (Uncomment these in Colab!)
# !pip install -q transformers datasets accelerate librosa soundfile torch evaluate

import torch
import librosa
import numpy as np
from datasets import load_dataset, Dataset, Audio
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification, TrainingArguments, Trainer
import evaluate

# ==========================================
# CONFIGURATION
# ==========================================
# Set this to the unzipped folder path
DATASET_PATH = "/content/my_dataset" 
MODEL_ID = "facebook/wav2vec2-base" # Latest Transformer Architecture
EPOCHS = 5
BATCH_SIZE = 8

def main():
    print("🚀 Initializing Srotram AI Next-Gen Architecture Training on Colab...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"🖥️ Using hardware: {device.upper()}")

    # 1. LOAD DATASET
    # You need a folder with two subfolders: "real" and "fake"
    # Example: 
    # dataset/real/audio1.wav
    # dataset/fake/audio2.wav
    try:
        from datasets import load_dataset
        dataset = load_dataset("audiofolder", data_dir=DATASET_PATH)
        print("✅ Dataset loaded successfully!")
    except Exception as e:
        print(f"⚠️ Error loading dataset: {e}")
        print("Make sure your dataset is structured with 'real' and 'fake' subfolders.")
        return

    # 2. PREPROCESSOR (Feature Extractor)
    feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_ID)

    def preprocess_function(examples):
        audio_arrays = [x["array"] for x in examples["audio"]]
        # Wav2Vec2 expects 16kHz audio
        inputs = feature_extractor(
            audio_arrays, 
            sampling_rate=16000, 
            max_length=16000 * 3, # 3 seconds
            truncation=True,
            padding="max_length"
        )
        return inputs

    # Resample dataset to 16kHz for Wav2Vec2
    dataset = dataset.cast_column("audio", Audio(sampling_rate=16000))
    encoded_dataset = dataset.map(preprocess_function, remove_columns=["audio"], batched=True)

    # 3. LOAD MODEL ARCHITECTURE
    id2label = {0: "real", 1: "fake"}
    label2id = {"real": 0, "fake": 1}

    model = AutoModelForAudioClassification.from_pretrained(
        MODEL_ID,
        num_labels=2,
        label2id=label2id,
        id2label=id2label,
    )

    # 4. METRICS
    accuracy = evaluate.load("accuracy")

    def compute_metrics(eval_pred):
        predictions = np.argmax(eval_pred.predictions, axis=1)
        return accuracy.compute(predictions=predictions, references=eval_pred.label_ids)

    # 5. TRAINING ARGUMENTS
    training_args = TrainingArguments(
        output_dir="./srotram-wav2vec2-deepfake",
        evaluation_strategy="epoch",
        save_strategy="epoch",
        learning_rate=3e-5,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=4,
        per_device_eval_batch_size=BATCH_SIZE,
        num_train_epochs=EPOCHS,
        warmup_ratio=0.1,
        logging_steps=10,
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        push_to_hub=False,
    )

    # 6. TRAINER
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=encoded_dataset["train"],
        eval_dataset=encoded_dataset["test"] if "test" in encoded_dataset else encoded_dataset["train"],
        tokenizer=feature_extractor,
        compute_metrics=compute_metrics,
    )

    print("🔥 Starting Training...")
    trainer.train()

    # 7. SAVE MODEL
    print("💾 Saving final model to /content/srotram-final-model")
    trainer.save_model("/content/srotram-final-model")
    print("✅ Done! You can now download the folder from Colab and use it in your local main.py")

if __name__ == "__main__":
    main()
