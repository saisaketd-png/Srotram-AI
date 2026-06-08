# Phase 1 Plan: Uploaded File Analyzer

## Objective
Build a dedicated "Upload Audio" analyzer in the UI to allow users to check static audio files (.wav, .mp3) for deepfakes, separate from the live real-time tracking microphone button.

## Context
The Gateway (`server.js`) already has a `demo:analyze_file` endpoint that processes uploaded buffers via Socket.io. However, the frontend (`index.html` and `app.js`) currently lacks the UI and logic to browse, select, read, and emit these files to the server.

## Execution Steps

### 1. Update `index.html` (Frontend UI)
- [ ] Add a hidden `<input type="file" id="audioUpload" accept="audio/*">` near the header buttons.
- [ ] Add a new button `<button class="hdr-btn upload-btn" onclick="triggerFileUpload()">UPLOAD FILE</button>` in the `.hdr-right` container, positioned to the left of the `ANALYZE` button.
- [ ] Style the button to ensure it looks distinct from the live "ANALYZE" record button (e.g., different icon or border style).

### 2. Update `app.js` (Frontend Logic)
- [ ] Implement `triggerFileUpload()` to programmatically click the hidden file input.
- [ ] Add an `onchange` event listener to `audioUpload` that:
  - Reads the selected file using `FileReader` as an `ArrayBuffer`.
  - Emits the `demo:analyze_file` event to the gateway with `{ fileName: file.name, audioData: arrayBuffer }`.
  - Disables the button temporarily and shows a "PROCESSING..." state.
- [ ] Listen for the `analysis:result` to re-enable the upload button and push the result to the UI.

### 3. Update `server.js` (Gateway Verification)
- [ ] Verify that `socket.on('demo:analyze_file')` properly parses the buffer and sends it to the AI engine without corrupting the sample rate. (This endpoint already exists, but we will ensure it returns the correct payload).

## Quality Gates
- [ ] The file upload button must not interfere with the live microphone capture.
- [ ] The system must handle large files by streaming or capping the buffer size.
- [ ] The result must visually update the dashboard gauges just like the live mic.
