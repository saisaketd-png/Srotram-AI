// Sentinel — Voice Intelligence Platform
const GATEWAY = 'http://localhost:4000';
let socket=null,isRecording=false,demoState=0;
let mediaRecorder=null,audioStream=null,audioCtx=null,analyser=null,animFrame=null;
let feedEntries=[],sparkData=Array(20).fill(0);
let recognition=null,fullTranscript='',sttActive=false;
let deepgramActive=false;  // global — read by startSTT() and set by transcript:status

const INTENT_CATEGORIES={
  urgency:{color:'#F56565',phrases:['act now','immediately','right away','hurry','time sensitive','expires today','limited time','last chance','final notice','deadline','within 24 hours','today only','must act','running out','asap'],stems:['urgent','hurry','rush','quick','fast','immediate','expir','deadline']},
  financial:{color:'#ECC94B',phrases:['send money','wire transfer','bank account','credit card','gift card','bitcoin','cryptocurrency','payment','transfer funds','western union','cash app','venmo','zelle','routing number','account number','pay now','outstanding balance','processing fee','refund','tax refund','guaranteed returns'],stems:['money','pay','fund','transfer','invest','refund','balance','financ','dollar','cash','deposit','withdraw']},
  authority:{color:'#4299E1',phrases:['irs','police','fbi','government','social security','tax department','court order','arrest warrant','legal action','department of','federal','agent','officer','customs','homeland security','microsoft support','apple support','tech support'],stems:['officer','agent','federal','authority','department','government','enforce','warrant','court','legal']},
  threats:{color:'#ED8936',phrases:['suspended','terminated','arrested','lawsuit','penalty','fine','jail','prison','prosecute','shut down','freeze your account','consequences','take legal action','report you','criminal charges','will be arrested'],stems:['suspend','terminat','arrest','prosecut','penalt','freez','cancel','block','threaten','punish']},
  personal:{color:'#9F7AEA',phrases:['verify your','confirm your','social security number','date of birth','password','pin number','otp','verification code','login credentials','mother maiden name','last four digits','full name','home address','id number','passport','driver license'],stems:['verify','confirm','password','credential','identif','authent','ssn','personal']}
};
let intentCounts={urgency:0,financial:0,authority:0,threats:0,personal:0};
let detectedPhrases=[];

window.addEventListener('DOMContentLoaded',()=>{
  initSpectroBars();initSparkline();initPrivacyFlows();connectSocket();
  switchTab('monitor');restoreTheme();
});

// ─── SOCKET ───────────────────────────────────────
function connectSocket(){
  socket=io(GATEWAY,{transports:['websocket'],reconnection:true});
  socket.on('connect',()=>updateConn(true));
  socket.on('disconnect',()=>updateConn(false));
  socket.on('gateway:connected',d=>{document.getElementById('statSession').textContent=d.sessionId.slice(0,8);});
  socket.on('analysis:result',handleAnalysis);
  socket.on('analysis:alert',d=>addFeed('alert',`ALERT [${d.score}%] ${d.message}`));
  socket.on('analysis:error',d=>addFeed('warning','Engine: '+d.message));
  socket.on('audio:chunk_ack',d=>{
    const sc=document.getElementById('statChunks');
    const sb=document.getElementById('statBytes');
    if(sc)sc.textContent=d.chunkIndex;
    if(sb)sb.textContent=(d.bytesReceived/1024).toFixed(1);
  });
  socket.on('telemetry:data',()=>{});

  // ─── DEEPGRAM TRANSCRIPTION ─────────────────────────────────
  socket.on('transcript:status', (d) => {
    const badge = document.getElementById('sttStatus');
    if (d.provider === 'deepgram') {
      deepgramActive = true;
      if (badge) {
        badge.textContent = d.status === 'ready' ? 'DEEPGRAM' : d.status.toUpperCase();
        badge.style.background = d.status === 'ready' ? 'rgba(0,200,100,0.15)' : '';
        badge.style.color = d.status === 'ready' ? '#00FF88' : '#F59E0B';
      }
      if (d.status === 'error') addFeed('warning', 'Deepgram: ' + d.message);
      else if (d.status === 'ready') addFeed('ok', 'Deepgram transcription active — API-powered live transcript');
    } else {
      // No API key — use Chrome STT fallback
      deepgramActive = false;
      if (badge) { badge.textContent = 'BROWSER STT'; badge.style.color = '#64748b'; }
    }
  });

  socket.on('transcript:result', (d) => {
    if (!d.text) return;
    const txFeed = document.getElementById('transcriptFeed');
    const empty = txFeed?.querySelector('.feed-empty');
    if (empty) empty.remove();

    if (!d.isFinal) {
      // Interim: show in the interim line
      const il = document.getElementById('interimLine');
      if (il) {
        il.classList.remove('hidden');
        const words = d.text.trim().split(' ');
        il.innerHTML = words.map((w,i) =>
          i === words.length-1
            ? `<span style="color:var(--cyan);font-weight:700">${w}</span>`
            : `<span style="opacity:0.6">${w}</span>`
        ).join(' ') + ' <span style="opacity:0.3">...</span>';
      }
    } else {
      // Final: commit to transcript feed
      const il = document.getElementById('interimLine');
      if (il) il.classList.add('hidden');
      if (d.text.trim()) {
        addTranscriptLine(d.text.trim());
        scanIntent(d.text.toLowerCase());
        // Also send to AI engine for NLP analysis
        socket.emit('transcript:text', { text: d.text.trim() });
      }
    }
  });

  socket.on('challenge:phrase',d=>{
    document.getElementById('phraseText').textContent=d.phrase;
    document.getElementById('challengePhrase').classList.remove('hidden');
    startChallengeTimer();
  });
  socket.on('challenge:result',d=>{
    const el=document.getElementById('challengeResult');
    el.classList.remove('hidden');
    const assess=d.assessment==='natural'?'✅ Natural Response':d.assessment==='suspicious'?'⚠️ Suspicious':'🚨 Likely Synthetic';
    const col=d.assessment==='natural'?'#00FF88':d.assessment==='suspicious'?'#F59E0B':'#FF2D55';
    document.getElementById('crAssessment').textContent=assess;
    document.getElementById('crAssessment').style.color=col;
    document.getElementById('crLatency').textContent=d.latency_ms+'ms';
    document.getElementById('crDesc').textContent=d.assessment==='natural'?'Response time consistent with a real human.':d.assessment==='suspicious'?'Response slightly delayed — may indicate AI processing.':'Response latency suggests AI-generated speech pipeline.';
    clearInterval(challengeInterval);
    document.getElementById('challengeTimer').classList.add('hidden');
    document.getElementById('challengeTimer').classList.add('hidden');
  });
  // demo:status listener removed for pure production analysis
}

function updateConn(ok){
  const el=document.getElementById('connStatus');
  const dot=el.querySelector('.conn-dot');
  dot.className='conn-dot'+(ok?' online':'');
  el.querySelector('span:last-child').textContent=ok?'CONNECTED':'OFFLINE';
}

// ─── RECORDING ────────────────────────────────────
async function toggleRecording(){if(isRecording){stopRecording();}else{await startRecording();}}

async function startRecording(){
  try{
    // ── Step 1: get mic stream (NO forced sample rate — use OS native) ──
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount:1, echoCancellation:false, noiseSuppression:false, autoGainControl:false }
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const nativeSR = audioCtx.sampleRate;

    // Resume if suspended (Chrome requires user gesture)
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(audioStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    // ── Step 2: try AudioWorklet (modern, reliable) ─────────────────
    let pcmBuffer = [];
    const samplesPerChunk = Math.floor(nativeSR * 0.5); // 500ms chunks
    let silentChunkCount = 0;
    let signalConfirmed = false;

    function handlePCMChunk(samples){
      // Compute RMS to detect real signal
      let rmsSum = 0;
      for(let i=0;i<samples.length;i++) rmsSum += samples[i]*samples[i];
      const rms = Math.sqrt(rmsSum / samples.length);

      if(rms > 0.0001){
        signalConfirmed = true;
        silentChunkCount = 0;
        if(signalConfirmed && silentChunkCount === 0){
          const lvl = Math.min(100, Math.round(rms * 1000));
          const bar = document.getElementById('audioLevelBar');
          const val = document.getElementById('audioLevelVal');
          if(bar) bar.style.width = lvl + '%';
          if(val) val.textContent = lvl + '%';
        }
      } else {
        silentChunkCount++;
        if(silentChunkCount === 6){
          addFeed('warning', '⚠ Mic zero signal — open Windows Sound Settings > Input > set mic volume to 100%');
        }
      }

      // Accumulate into larger buffer and emit to socket
      for(let i=0;i<samples.length;i++) pcmBuffer.push(samples[i]);
      while(pcmBuffer.length >= samplesPerChunk){
        const fc = new Float32Array(pcmBuffer.splice(0, samplesPerChunk));
        socket.emit('audio:chunk',{chunk: new Uint8Array(fc.buffer), sampleRate: nativeSR, timestamp: Date.now()});
      }
    }

    const hasWorklet = typeof audioCtx.audioWorklet !== 'undefined';
    if(hasWorklet){
      try{
        await audioCtx.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(audioCtx, 'aegis-audio-processor', {
          processorOptions: { chunkSamples: 4800 }
        });
        workletNode.port.onmessage = (e) => {
          const pcm = new Float32Array(e.data.pcm);
          handlePCMChunk(pcm);
        };
        source.connect(workletNode);
        workletNode.connect(audioCtx.destination);
        mediaRecorder = workletNode;
        addFeed('ok', `[AudioWorklet] Mic active @ ${nativeSR}Hz — awaiting signal...`);
      } catch(wErr){
        addFeed('warning', 'AudioWorklet failed, using fallback: '+wErr.message);
        hasWorklet && _useScriptProcessor(source, nativeSR, handlePCMChunk);
      }
    } else {
      _useScriptProcessor(source, nativeSR, handlePCMChunk);
    }

    updateAudioLevel();
    startSTT();
    isRecording = true;
    const btn = document.getElementById('recordBtn');
    btn.innerHTML = '<span class="rec-icon">●</span> STOP';
    btn.classList.add('recording');
    document.getElementById('spectroStatus').textContent = 'LIVE';
    document.getElementById('spectroStatus').style.color = 'var(--green)';

  } catch(err){
    addFeed('warning', 'Microphone error: ' + err.message);
  }
}

function _useScriptProcessor(source, nativeSR, handlePCMChunk){
  const proc = audioCtx.createScriptProcessor(4096, 1, 1);
  let buf = [];
  proc.onaudioprocess = (e) => {
    const inp = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(inp.length);
    copy.set(inp);
    handlePCMChunk(copy);
  };
  source.connect(proc);
  proc.connect(audioCtx.destination);
  mediaRecorder = proc;
  addFeed('ok', `[ScriptProcessor fallback] Mic active @ ${nativeSR}Hz`);
}


function stopRecording(){
  if(mediaRecorder){mediaRecorder.disconnect();mediaRecorder.onaudioprocess=null;mediaRecorder=null;}
  audioStream?.getTracks().forEach(t=>t.stop());
  if(audioCtx&&audioCtx.state!=='closed')audioCtx.close();
  if(animFrame)cancelAnimationFrame(animFrame);
  stopSTT();
  isRecording=false;
  const btn=document.getElementById('recordBtn');
  btn.innerHTML='<span class="rec-icon">●</span> ANALYZE';btn.classList.remove('recording');
  document.getElementById('spectroStatus').textContent='IDLE';
  document.getElementById('spectroStatus').style.color='';
  document.getElementById('audioLevelBar').style.width='0';
  document.getElementById('audioLevelVal').textContent='0%';
  addFeed('ok','Audio capture stopped');
}

// ─── FILE UPLOAD ANALYZER ─────────────────────────
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const uploadBtn = document.getElementById('uploadBtn');
  uploadBtn.innerHTML = '<span class="rec-icon" style="color:var(--amber)">⏳</span> PROCESSING';
  uploadBtn.style.borderColor = 'var(--amber)';
  uploadBtn.style.color = 'var(--amber)';
  addFeed('ok', `Reading uploaded file: ${file.name}`);

  const reader = new FileReader();
  reader.onload = async function(e) {
    const arrayBuffer = e.target.result;
    try {
      // Create a temporary AudioContext to decode MP3/WAV into pure PCM audio
      const tempCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const decodedData = await tempCtx.decodeAudioData(arrayBuffer);
      const pcmFloat32 = decodedData.getChannelData(0);
      
      // Send the pristine PCM data to the Gateway for accurate analysis
      socket.emit('demo:analyze_file', {
        fileName: file.name,
        audioData: pcmFloat32.buffer
      });
      addFeed('ok', `Decoded & sent ${file.name} to AI Engine`);
    } catch (decodeErr) {
      addFeed('warning', 'Audio decoding failed. Ensure it is a valid audio file.');
    }
    
    // Reset button after 2 seconds to allow consecutive uploads
    setTimeout(() => {
      uploadBtn.innerHTML = '<span class="rec-icon" style="color:var(--cyan)">⬆</span> UPLOAD FILE';
      uploadBtn.style.borderColor = 'var(--cyan)';
      uploadBtn.style.color = 'var(--cyan)';
      event.target.value = ''; // Reset input
    }, 2000);
  };
  reader.onerror = function() {
    addFeed('warning', 'Failed to read uploaded file.');
    uploadBtn.innerHTML = '<span class="rec-icon" style="color:var(--cyan)">⬆</span> UPLOAD FILE';
    uploadBtn.style.borderColor = 'var(--cyan)';
    uploadBtn.style.color = 'var(--cyan)';
  };
  reader.readAsArrayBuffer(file);
}

// ─── SPEECH-TO-TEXT ───────────────────────────────
function startSTT(){
  if(deepgramActive){return;}  // Deepgram handles transcription — skip Chrome STT
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addFeed('warning','STT: Use Chrome/Edge for live transcript (or set DEEPGRAM_API_KEY)');return;}
  if(sttActive)return;

  recognition=new SR();
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.lang='en-US';
  sttActive=false;

  const txFeed=document.getElementById('transcriptFeed');
  const empty=txFeed.querySelector('.feed-empty');
  if(empty)empty.remove();

  recognition.onstart=()=>{
    sttActive=true;
    const badge=document.getElementById('sttStatus');
    badge.textContent='LISTENING';badge.className='stt-badge listening';
  };

  recognition.onresult=(ev)=>{
    let interim='',final='';
    for(let i=ev.resultIndex;i<ev.results.length;i++){
      const t=ev.results[i][0].transcript;
      if(ev.results[i].isFinal)final+=t;
      else interim+=t;
    }

    // Update interim display
    const il=document.getElementById('interimLine');
    if(interim.trim()){
      il.classList.remove('hidden');
      const words=interim.trim().split(' ');
      il.innerHTML=words.map((w,i)=>i===words.length-1?`<span style="color:var(--cyan);font-weight:700">${w}</span>`:`<span style="opacity:0.6">${w}</span>`).join(' ')+' <span style="opacity:0.3">...</span>';
    } else {
      il.classList.add('hidden');
    }

    if(final.trim()){
      fullTranscript+=final+' ';
      addTranscriptLine(final.trim());
      scanIntent(final.toLowerCase());
      if(socket?.connected)socket.emit('transcript:text',{text:final.trim(),full:fullTranscript.trim()});
    }
  };

  recognition.onerror=(ev)=>{
    if(ev.error==='no-speech')return;
    sttActive=false;
    if(ev.error==='not-allowed'){addFeed('warning','STT: Microphone permission denied');return;}
  };

  recognition.onend=()=>{
    sttActive=false;
    if(isRecording){
      setTimeout(()=>{
        if(isRecording&&recognition){
          try{recognition.start();}catch(e){}
        }
      },500);
    } else {
      const badge=document.getElementById('sttStatus');
      badge.textContent='IDLE';badge.className='stt-badge';
      document.getElementById('interimLine').classList.add('hidden');
    }
  };

  try{recognition.start();}catch(e){console.warn('STT start:',e);}
}

function stopSTT(){
  if(recognition){recognition.onend=null;try{recognition.stop();}catch(e){}recognition=null;}
  sttActive=false;
  document.getElementById('sttStatus').textContent='IDLE';
  document.getElementById('sttStatus').className='stt-badge';
  document.getElementById('interimLine').classList.add('hidden');
}

function addTranscriptLine(text){
  const feed=document.getElementById('transcriptFeed');
  const div=document.createElement('div');
  div.className='tx-row tx-final';
  div.innerHTML=`<span class="tx-time">${new Date().toLocaleTimeString()}</span>${text}`;
  feed.appendChild(div);
  feed.scrollTop=feed.scrollHeight;
}

// ─── INTENT SCAN ──────────────────────────────────
function scanIntent(text){
  for(const[cat,cfg]of Object.entries(INTENT_CATEGORIES)){
    for(const phrase of cfg.phrases){
      if(text.includes(phrase)&&!detectedPhrases.includes(phrase)){
        detectedPhrases.push(phrase);intentCounts[cat]++;
        addFeed('scam',`Scam phrase: "${phrase}"`);
      }
    }
    const words=text.split(/\s+/);
    for(const word of words){
      const cw=word.replace(/[^a-z]/g,'');
      if(cw.length<3)continue;
      for(const stem of cfg.stems){
        if(cw.includes(stem)&&!detectedPhrases.includes(cw)){
          detectedPhrases.push(cw);intentCounts[cat]++;
          addFeed('nlp',`Semantic match: "${cw}"`);break;
        }
      }
    }
  }
  updateIntentPanel();
}

function updateIntentPanel(){
  const total=Object.values(intentCounts).reduce((a,b)=>a+b,0);
  const lv=document.getElementById('nlpIntentLevel');
  const cnt=document.getElementById('nlpIntentCount');
  if(lv){lv.textContent=total>=5?'HIGH':total>=2?'MEDIUM':'LOW';lv.style.color=total>=5?'#FF2D55':total>=2?'#F59E0B':'#00FF88';}
  if(cnt)cnt.textContent=total;
  for(const[cat,count]of Object.entries(intentCounts)){
    const el=document.getElementById('intent-'+cat);
    if(el){el.textContent=count;el.className='ic-count'+(count>0?' flagged':'');}
  }
  if(detectedPhrases.length>0){
    const fl=document.getElementById('transcriptFlags');
    if(fl)fl.classList.remove('hidden');
    const fp=document.getElementById('flaggedPhrases');
    if(fp)fp.textContent=detectedPhrases.slice(-5).join(', ');
  }
}

// ─── AUDIO LEVEL ─────────────────────────────────
function updateAudioLevel(){
  if(!analyser)return;
  const data=new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const avg=data.reduce((a,b)=>a+b,0)/data.length/255;
  document.getElementById('audioLevelBar').style.width=(avg*100)+'%';
  document.getElementById('audioLevelVal').textContent=Math.round(avg*100)+'%';
  updateSpectroBars(data);
  animFrame=requestAnimationFrame(updateAudioLevel);
}

// ─── ANALYSIS HANDLER ────────────────────────────
function handleAnalysis(d){
  const risk=d.risk_score||0;
  console.log('[SENTINEL] Analysis received:', risk, '| acoustic:', d.acoustic_score, '| xai:', d.xai_report);
  updateGauge(risk,d.acoustic_score||0,d.behavioral_score||0,d.nlp_score||0,d.network_score||0);
  updateXAI(d);
  updateEmotion(d.emotion);

  const label=risk>=75?'SYNTHETIC':risk>=50?'SUSPICIOUS':'CLEAN';
  const type=risk>=75?'alert':risk>=50?'warning':'ok';
  addFeed(type,`${label} — Risk: ${risk}% | Acoustic: ${Math.round(d.acoustic_score||0)}% | Behavioral: ${Math.round(d.behavioral_score||0)}%`);

  if (d.transcript) {
    addFeed('ok', `File Transcribed: ${d.transcript.substring(0, 30)}...`);
    addTranscriptLine(d.transcript);
    scanIntent(d.transcript.toLowerCase());
  }

  if(d.latency_ms){
    sparkData.push(d.latency_ms);sparkData.shift();updateSparkline();
    document.getElementById('latencyVal').textContent=d.latency_ms+'ms';
    const ic=document.getElementById('inferenceCount');
    if(ic)ic.textContent=(parseInt(ic.textContent)||0)+1+' inferences';
  }
}

// ─── GAUGE ───────────────────────────────────────
function updateGauge(risk,ac,bh,nlp,net){
  const circ=2*Math.PI*80;
  const offset=circ-(risk/100)*circ;
  const ring=document.getElementById('gaugeRing');
  const color=risk<30?'#00FF88':risk<60?'#F59E0B':'#FF2D55';
  ring.style.strokeDashoffset=offset;
  ring.style.stroke=color;
  ring.style.filter=`drop-shadow(0 0 10px ${color})`;

  const sc=document.getElementById('riskScore');
  sc.textContent=Math.round(risk);sc.style.color=color;

  const panel=document.getElementById('shieldPanel');
  panel.style.borderColor=color+'33';

  const badge=document.getElementById('threatBadge');
  if(risk>=75){badge.textContent='THREAT';badge.style.color='#FF2D55';}
  else if(risk>=40){badge.textContent='SUSPICIOUS';badge.style.color='#F59E0B';}
  else{badge.textContent='SAFE';badge.style.color='#00FF88';}

  setBar('Acoustic',ac,'#00FF88');setBar('Behavioral',bh,'#38BDF8');
  setBar('Nlp',nlp,'#A78BFA');setBar('Network',net,'#F59E0B');
}

function setBar(name,val,color){
  const bar=document.getElementById('bar'+name);
  const lbl=document.getElementById('val'+name);
  if(bar){bar.style.width=Math.round(val)+'%';bar.style.background=color;}
  if(lbl)lbl.textContent=Math.round(val)+'%';
}

// ─── XAI ─────────────────────────────────────────
function updateXAI(d){
  const xaiEl=document.getElementById('xaiText');
  xaiEl.textContent=d.xai_report||'No anomalies detected.';
  const risk=d.risk_score||0;
  xaiEl.style.borderLeftColor=risk>=75?'#FF2D55':risk>=50?'#F59E0B':'#00FF88';

  const st=document.getElementById('xaiStatus');
  st.textContent=risk>=75?'CRITICAL':risk>=50?'SUSPICIOUS':'CLEAN';
  st.style.color=risk>=75?'#FF2D55':risk>=50?'#F59E0B':'#00FF88';

  const mx=document.getElementById('xaiMetrics');
  if(d.inference_ms!=null){
    mx.classList.remove('hidden');
    document.getElementById('xmInference').textContent=d.inference_ms+'ms';
    document.getElementById('xmAudio').textContent=d.audio_bytes?(d.audio_bytes/1024).toFixed(1)+' KB':'—';
    document.getElementById('xmModel').textContent=d.model_version||'v2.5';
  }
}

// ─── EMOTION ─────────────────────────────────────
const EMOJIS={neutral:'😐',anxious:'😰',calm:'😌',aggressive:'😠',fearful:'😨',flat:'😶'};
const ECOLORS={neutral:'#64748b',anxious:'#f59e0b',calm:'#22c55e',aggressive:'#ef4444',fearful:'#a855f7',flat:'#6b7280'};
function updateEmotion(e){
  if(!e)return;
  const c=ECOLORS[e.current]||'#64748b';
  document.getElementById('emotionIcon').textContent=EMOJIS[e.current]||'😐';
  document.getElementById('emotionIcon').style.borderColor=c;
  document.getElementById('emotionLabel').textContent=e.current||'neutral';
  document.getElementById('emotionLabel').style.color=c;
  document.getElementById('emotionDrift').textContent='Drift: '+Math.round(e.drift_score||0)+'%';
  document.getElementById('flatBadge').classList.toggle('hidden',!e.is_flat);
  const hist=document.getElementById('emotionHistory');
  hist.innerHTML='';
  (e.history||[]).forEach(h=>{
    const ch=document.createElement('div');ch.className='emo-chip';
    ch.style.background=(ECOLORS[h]||'#64748b')+'20';
    ch.style.borderColor=(ECOLORS[h]||'#64748b')+'50';
    ch.textContent=EMOJIS[h]||'😐';hist.appendChild(ch);
  });
}

// ─── CHALLENGE ────────────────────────────────────
let challengeInterval=null;
function generateChallenge(){
  socket.emit('challenge:generate');
  document.getElementById('genPhraseBtn').classList.add('hidden');
  document.getElementById('respondBtn').classList.remove('hidden');
  document.getElementById('challengeResult').classList.add('hidden');
}
function submitResponse(){
  socket.emit('challenge:response_received');
  document.getElementById('respondBtn').classList.add('hidden');
  document.getElementById('genPhraseBtn').classList.remove('hidden');
}
function startChallengeTimer(){
  document.getElementById('challengeTimer').classList.remove('hidden');
  let s=0;
  clearInterval(challengeInterval);
  challengeInterval=setInterval(()=>{s+=0.1;document.getElementById('challengeTimer').textContent=s.toFixed(1)+'s';},100);
}

// ─── FEED ─────────────────────────────────────────
function addFeed(type,text){
  const feed=document.getElementById('intelFeed');
  const empty=feed.querySelector('.feed-empty');
  if(empty)empty.remove();
  const div=document.createElement('div');
  div.className=`feed-row fr-${type}`;
  div.innerHTML=`<span>${text}</span><span class="fr-time">${new Date().toLocaleTimeString()}</span>`;
  feed.insertBefore(div,feed.firstChild);
  feedEntries.unshift({type,text});
  if(feedEntries.length>60){feedEntries.pop();if(feed.lastChild)feed.removeChild(feed.lastChild);}
  const ct=document.getElementById('eventCount');
  if(ct)ct.textContent=feedEntries.length+' events';
}

// ─── SPECTROGRAM ─────────────────────────────────
function initSpectroBars(){
  const c=document.getElementById('spectroBars');
  for(let i=0;i<48;i++){const b=document.createElement('div');b.className='s-bar';c.appendChild(b);}
}
function updateSpectroBars(data){
  const bars=document.querySelectorAll('.s-bar');
  const risk=parseFloat(document.getElementById('riskScore').textContent)||0;
  const c=risk<30?'rgba(0,255,136,':risk<60?'rgba(245,158,11,':'rgba(255,45,85,';
  const step=Math.floor(data.length/bars.length);
  bars.forEach((b,i)=>{
    const v=data[i*step]||0;
    b.style.height=Math.max(2,(v/255)*68)+'px';
    b.style.background=c+(0.3+(v/255)*0.7)+')';
  });
}

// ─── SPARKLINE ───────────────────────────────────
function initSparkline(){
  const c=document.getElementById('sparkline');
  for(let i=0;i<20;i++){const b=document.createElement('div');b.className='spark-bar';b.style.height='2px';c.appendChild(b);}
}
function updateSparkline(){
  const bars=document.querySelectorAll('.spark-bar');
  const max=Math.max(...sparkData,1);
  bars.forEach((b,i)=>{
    const v=sparkData[i];
    b.style.height=Math.max(2,(v/max)*26)+'px';
    b.style.background=v<200?'var(--green)':v<400?'var(--amber)':'var(--red)';
  });
}

// ─── PRIVACY FLOWS ────────────────────────────────
function initPrivacyFlows(){
  const flows=[
    {from:'Microphone',to:'Browser ScriptProcessor',ok:true},
    {from:'Browser',to:'Gateway localhost:4000',ok:true},
    {from:'Gateway',to:'AI Engine localhost:8000',ok:true},
    {from:'AI Engine',to:'RTX 3050 (CUDA)',ok:true},
    {from:'External APIs',to:'NONE',ok:false,blocked:true}
  ];
  const c=document.getElementById('dataFlows');
  flows.forEach((f,i)=>{
    const d=document.createElement('div');d.className='data-flow';d.style.animationDelay=(i*0.1)+'s';
    const dotC=f.ok?'var(--green)':'var(--red)';
    d.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${dotC};box-shadow:0 0 6px ${dotC};flex-shrink:0"></span><span style="flex:1">${f.from}</span><span style="color:var(--muted)">${f.blocked?'✕':'→'}</span><span style="color:${dotC}">${f.to}</span>${f.blocked?'<span class="df-blocked">BLOCKED</span>':''}`;
    c.appendChild(d);
  });
}

// ─── TABS / THEME ─────────────────────────────────
function switchTab(tab){
  document.getElementById('monitorTab').classList.toggle('hidden',tab!=='monitor');
  document.getElementById('privacyTab').classList.toggle('hidden',tab!=='privacy');
  document.getElementById('tabMonitor').classList.toggle('active',tab==='monitor');
  document.getElementById('tabPrivacy').classList.toggle('active',tab==='privacy');
}
// Demo toggle removed for pure analysis
function toggleTheme(){
  const isLight=document.body.classList.toggle('light-theme');
  document.getElementById('themeBtn').textContent=isLight?'🌙':'☀';
  localStorage.setItem('sentinel-theme',isLight?'light':'dark');
}
function restoreTheme(){
  if(localStorage.getItem('sentinel-theme')==='light'){
    document.body.classList.add('light-theme');
    const b=document.getElementById('themeBtn');if(b)b.textContent='🌙';
  }
}
