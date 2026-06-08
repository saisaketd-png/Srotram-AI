# Phase 2 Plan: File Transcription & Accuracy Fix

## Objective
Fix the file upload accuracy bug (the engine is misclassifying files due to raw format decoding errors) and implement an automatic Speech-to-Text (STT) transcription feature for uploaded files that highlights fraudulent keywords.

## Root Cause of Inaccuracy
Currently, `app.js` uploads raw `.mp3` or `.wav` files directly to the Python engine. However, the Python `_decode` function expects **raw Float32 PCM arrays**. Because the Python engine is trying to read an MP3 file as raw PCM data, it processes garbage noise, which ruins the neural network's accuracy.

## Execution Steps

### 1. Fix Audio Decoding (Frontend `app.js`)
- [ ] Modify `handleFileUpload` to use the browser's `AudioContext.decodeAudioData()` on the uploaded file.
- [ ] Extract the raw PCM Float32Array from `audioBuffer.getChannelData(0)`.
- [ ] Send this decoded, pristine PCM array to the Gateway instead of the raw file buffer. This will instantly fix the Neural Network accuracy and return it to 99%+ precision.

### 2. Implement File Transcription (Python Backend `main.py`)
- [ ] Import `faster-whisper` in `main.py` (which is already installed in your `requirements.txt`).
- [ ] Add a fast Whisper model initialization in the engine's `__init__`.
- [ ] Update the `/analyze` endpoint to run Whisper STT on the incoming PCM audio chunk if `X-Upload-Source: file` is detected.
- [ ] Return the `transcript` in the JSON response payload alongside the deepfake scores.

### 3. Display Transcript & Fraud Keywords (Frontend `index.html` & `app.js`)
- [ ] Update `app.js` to catch the `transcript` from the file analysis result.
- [ ] Inject the text into the Transcript UI box.
- [ ] Apply the existing keyword highlighting logic (highlighting words like "bank", "urgent", "OTP", "police") so the user can visually see what triggered the NLP fraud score.

## Quality Gates
- [ ] Uploaded files must match the exact accuracy of the live microphone.
- [ ] Transcription must complete within 2-3 seconds using Whisper base/tiny models.
- [ ] Fraud keywords must be visibly highlighted in red in the UI transcript box.
