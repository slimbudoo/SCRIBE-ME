// SCRIBE-ME automatic import fallback — no server uploads or automatic speaker identification.
// SCRIBE-ME: static, single-file client-side transcription. No upload endpoint.
const $=id=>document.getElementById(id);
const waveHeights=[18,37,63,25,91,46,72,116,57,92,40,124,72,49,108,32,84,66,24,77,39,60,17];
$('wave').innerHTML=waveHeights.map((h,i)=>`<b style="--h:${h}px;--o:${0.55+0.45*Math.sin((i+3)/24*Math.PI)}"></b>`).join('');
let selectedFile=null, objectUrl=null, decoded=null, worker=null, segments=[], speakers=['Speaker 1','Speaker 2'], busy=false, toastTimer;
let audioContext=null, duration=0, ffmpegInstance=null;
const MAX_BYTES=350*1024*1024, SLICE_SECONDS=25, MODEL_IDS={tiny:'onnx-community/whisper-tiny.en',base:'onnx-community/whisper-base.en',small:'onnx-community/whisper-small.en'};
function notice(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3900)}
function diagnostic(message){$('diagnostics').textContent='Stable · '+message;$('copy-diagnostic').style.display=message.includes('failed:')?'inline-block':'none'}
$('copy-diagnostic').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('diagnostics').textContent);notice('Error details copied.')}catch(e){notice('Select the error message to copy it.')}});
function status(message,progress){$('status').textContent=message;if(Number.isFinite(progress)){const n=Math.max(0,Math.min(100,progress));$('percent').textContent=Math.round(n)+'%';$('bar').style.width=n+'%'}}
function bytes(n){return (n/1024/1024).toFixed(1)+' MB'}
function stamp(s){s=Math.max(0,Math.floor(s||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')}
function resetFile(){if(busy)return;selectedFile=null;decoded=null;duration=0;segments=[];if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;$('player').removeAttribute('src');$('audio-wrap').style.display='none';$('file-card').style.display='none';$('drop').style.display='flex';$('start').disabled=true;$('start').textContent='Choose a recording to begin ↗';$('file').value='';$('copy').disabled=true;$('download').disabled=true;$('add-speaker').disabled=true;$('search-area').style.display='none';$('footer-note').textContent='Every word stays on your device.';status('Ready when you are',0);diagnostic('Awaiting recording.');$('count').textContent='0 sections';render()}
function choose(file){if(busy||!file)return;if(file.size>MAX_BYTES){notice('File exceeds 350 MB. Try an audio-only export or smaller recording.');return}if(objectUrl)URL.revokeObjectURL(objectUrl);selectedFile=file;decoded=null;segments=[];duration=0;objectUrl=URL.createObjectURL(file);$('filename').textContent=file.name;$('filemeta').textContent=bytes(file.size)+' · '+(file.type||'media file');$('file-card').style.display='flex';$('drop').style.display='none';$('start').disabled=false;$('start').textContent='✳  Transcribe recording';$('player').src=objectUrl;$('audio-wrap').style.display='block';$('copy').disabled=true;$('download').disabled=true;$('add-speaker').disabled=true;$('search-area').style.display='none';status('Recording ready',0);diagnostic('Recording loaded; model not started.');$('count').textContent='0 sections';render();if(file.size>64*1024*1024)notice('Large recording selected. SCRIBE-ME will automatically process it in short sections.')}
$('browse').addEventListener('click',ev=>{ev.stopPropagation();$('file').click()});$('drop').addEventListener('click',()=>!busy&&$('file').click());$('drop').addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&!busy){ev.preventDefault();$('file').click()}});$('file').addEventListener('change',e=>choose(e.target.files[0]));$('remove').addEventListener('click',resetFile);
for(const ev of ['dragenter','dragover'])$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.add('drag')});for(const ev of ['dragleave','drop'])$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.remove('drag')});$('drop').addEventListener('drop',e=>choose(e.dataTransfer.files[0]));
function workerSource(){return `
let transcriber=null;let currentKey='';
self.onmessage=async e=>{
 const m=e.data;
 try {
  if(m.type==='load'){
   self.postMessage({type:'stage',message:'Loading speech recognition library…'});
   const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
   env.allowLocalModels=false;
   const key=m.model+'|'+m.device;
   if(currentKey!==key){if(transcriber?.dispose)await transcriber.dispose();transcriber=null;currentKey=''}
   if(!transcriber){
    const options={device:m.device,...(m.device==='wasm'?{dtype:'q8'}:{}),progress_callback:p=>{if(p.status==='progress'&&typeof p.progress==='number')self.postMessage({type:'model-progress',value:p.progress});}};
    transcriber=await pipeline('automatic-speech-recognition',m.model,options);currentKey=key;
   }
   self.postMessage({type:'loaded'});
  }else if(m.type==='segment'){
   // English-only Whisper .en models reject task/language generation options.
   const samples=new Float32Array(m.audio);
   let result=await transcriber(samples,{return_timestamps:true});
   // Some model/browser combinations return no words when timestamps are requested.
   // Retry without timestamps before reporting a silent result.
   const spoken=(r)=>typeof r?.text==='string'&&r.text.trim() || (Array.isArray(r?.chunks)&&r.chunks.some(c=>c?.text?.trim()));
   if(!spoken(result)) result=await transcriber(samples);
   self.postMessage({type:'result',id:m.id,result});
  }
 }catch(err){self.postMessage({type:'error',message:err?.message||String(err)})}
};`}
function request(w,data,transfer=[]){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{clean();reject(new Error('Processing timed out. Try a smaller model or shorter recording.'))},10*60*1000);function clean(){clearTimeout(timeout);w.removeEventListener('message',onMessage);w.removeEventListener('error',onError)}function onError(e){clean();reject(new Error(e.message||'The transcription worker stopped unexpectedly.'))}function onMessage(e){const m=e.data;if(m.type==='stage'){status(m.message);return}if(m.type==='model-progress'){status('Downloading AI model…',Math.min(12,(m.value||0)*.12));return}if(m.type==='error'){clean();reject(new Error(m.message));return}if(m.type==='loaded'&&data.type==='load'||m.type==='result'&&data.type==='segment'&&m.id===data.id){clean();resolve(m)}}w.addEventListener('message',onMessage);w.addEventListener('error',onError);w.postMessage(data,transfer)})}
// Extract and downmix directly from decoded audio. This avoids intermittent silent
// OfflineAudioContext renders on some Safari/Chromium configurations.
async function resampleSlice(buffer,start,end){
 const rate=buffer.sampleRate, targetRate=16000;
 const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
 const first=Math.max(0,Math.floor(start*rate)), last=Math.min(buffer.length,Math.ceil(end*rate));
 const count=Math.max(1,Math.floor((last-first)*targetRate/rate));
 const output=new Float32Array(count);
 const scale=rate/targetRate;
 for(let i=0;i<count;i++){
  const x=first+i*scale,j=Math.min(last-1,Math.floor(x)),next=Math.min(last-1,j+1),f=x-j;
  let sample=0;
  for(const channel of channels)sample+=channel[j]*(1-f)+channel[next]*f;
  output[i]=sample/channels.length;
 }
 return output;
}
// Convert only the required time range using FFmpeg.wasm. This avoids decompressing
// an entire long recording into a browser AudioBuffer. The original media remains local.
function wavToMonoFloat(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const str=(a,n)=>String.fromCharCode(...Array.from({length:n},(_,i)=>view.getUint8(a+i)));
 if(str(0,4)!=='RIFF'||str(8,4)!=='WAVE')throw new Error('Converted audio was not a WAV file.');
 let pos=12,channels=0,rate=0,format=0,bits=0,dataAt=-1,dataSize=0;
 while(pos+8<=view.byteLength){
  const tag=str(pos,4),len=view.getUint32(pos+4,true),next=pos+8+len+(len%2);
  if(tag==='fmt '){format=view.getUint16(pos+8,true);channels=view.getUint16(pos+10,true);rate=view.getUint32(pos+12,true);bits=view.getUint16(pos+22,true)}
  if(tag==='data'){dataAt=pos+8;dataSize=Math.min(len,view.byteLength-dataAt);break}
  pos=next;
 }
 if(dataAt<0||format!==1||bits!==16||channels!==1||rate!==16000)throw new Error('Converted WAV format was not 16 kHz mono PCM.');
 const n=Math.floor(dataSize/2),out=new Float32Array(n);
 for(let i=0;i<n;i++)out[i]=view.getInt16(dataAt+i*2,true)/32768;
 return out;
}
async function loadFFmpeg(){
 if(ffmpegInstance)return ffmpegInstance;
 status('Loading automatic audio converter…',2);
 const [{FFmpeg},{toBlobURL}]=await Promise.all([import('@ffmpeg/ffmpeg'),import('@ffmpeg/util')]);
 const ff=new FFmpeg();
 const core='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
 await ff.load({coreURL:await toBlobURL(core+'/ffmpeg-core.js','text/javascript'),wasmURL:await toBlobURL(core+'/ffmpeg-core.wasm','application/wasm')});
 ffmpegInstance=ff;
 return ff;
}
async function prepareFFmpeg(file){
 const ff=await loadFFmpeg();
 status('Preparing recording for automatic conversion…',3);
 await ff.writeFile('scribe-input',new Uint8Array(await file.arrayBuffer()));
 let detected='';
 const onLog=({message})=>{const match=message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);if(match)detected=String((+match[1])*3600+(+match[2])*60+(+match[3]))};
 ff.on('log',onLog);
 try{await ff.exec(['-hide_banner','-i','scribe-input'])}finally{ff.off('log',onLog)}
 let d=Number(detected);
 if(!Number.isFinite(d)||d<=0){
   d=await new Promise(resolve=>{const el=document.createElement('audio');el.preload='metadata';el.src=objectUrl;const timer=setTimeout(()=>{el.removeAttribute('src');resolve(0)},5000);el.onloadedmetadata=()=>{clearTimeout(timer);resolve(el.duration)};el.onerror=()=>{clearTimeout(timer);resolve(0)}});
 }
 if(!Number.isFinite(d)||d<=0)throw new Error('Audio converter could not read the recording duration. The file may be damaged or unsupported.');
 return {ff,duration:d};
}
async function convertSlice(ff,start,length){
 const name='scribe-part.wav';
 await ff.deleteFile(name).catch(()=>{});
 const code=await ff.exec(['-hide_banner','-loglevel','error','-ss',String(start),'-i','scribe-input','-t',String(length),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','wav','-y',name]);
 if(code!==0)throw new Error('Automatic audio conversion failed for part starting '+stamp(start)+'.');
 const data=await ff.readFile(name);
 const samples=wavToMonoFloat(data);
 await ff.deleteFile(name).catch(()=>{});
 return samples;
}
function audioLevel(samples){let sum=0;for(let i=0;i<samples.length;i++)sum+=samples[i]*samples[i];return Math.sqrt(sum/Math.max(1,samples.length))}
function hasWords(r){return !!(typeof r?.text==='string'&&r.text.trim() || Array.isArray(r?.chunks)&&r.chunks.some(c=>typeof c?.text==='string'&&c.text.trim()))}
function appendResult(result,offset,length){
 // A model may return a transcript string, timestamped chunks, or both.
 // Never discard non-empty text simply because an empty or malformed chunks array exists.
 const originalCount=segments.length;
 if(Array.isArray(result?.chunks))for(const part of result.chunks){
  const txt=typeof part?.text==='string'?part.text.trim():'';if(!txt)continue;
  const t=part.timestamp;
  const start=Array.isArray(t)&&Number.isFinite(t[0])?t[0]:0;
  const end=Array.isArray(t)&&Number.isFinite(t[1])?t[1]:length;
  segments.push({start:offset+start,end:offset+end,text:txt,speaker:-1});
 }
 if(segments.length===originalCount&&typeof result?.text==='string'&&result.text.trim())
  segments.push({start:offset,end:offset+length,text:result.text.trim(),speaker:-1});
 return segments.length-originalCount;
}
async function startManual(){if(busy||!selectedFile)return;busy=true;const button=$('start');button.disabled=true;$('remove').disabled=true;$('model').disabled=true;$('engine').disabled=true;button.textContent='Transcribing…';let done=false;
try{
 status('Preparing recording…',0);diagnostic('Starting a new transcription.');$('count').textContent='0 sections';
 let ff=null, buffer=null, importMethod='native';
 // Large media must not be fully decompressed into browser memory.
 if(selectedFile.size>64*1024*1024){
  importMethod='converter';
 }else{
  try{
   const ctx=new (window.AudioContext||window.webkitAudioContext)();audioContext=ctx;
   status('Decoding audio locally…',3);
   buffer=await ctx.decodeAudioData(await selectedFile.arrayBuffer());
   decoded=buffer;duration=buffer.duration;
  }catch(decodeError){
   console.warn('Native decode failed; trying local converter',decodeError);
   importMethod='converter';
   if(audioContext){await audioContext.close().catch(()=>{});audioContext=null}
  }
 }
 if(importMethod==='converter'){
  diagnostic('Browser decode unavailable or recording is large. Converting automatically in short sections.');
  try{const prepared=await prepareFFmpeg(selectedFile);ff=prepared.ff;duration=prepared.duration}
  catch(convertError){throw new Error('Automatic audio conversion could not start: '+convertError.message)}
 }
 if(duration<=0)throw new Error('No audio was detected in this recording.');
 if(!Number.isFinite(duration))throw new Error('Could not determine recording duration.');
 if(!window.Worker)throw new Error('This browser does not support Web Workers.');
 if(!worker){const url=URL.createObjectURL(new Blob([workerSource()],{type:'application/javascript'}));worker=new Worker(url,{type:'module'});URL.revokeObjectURL(url)}
 const wantGpu=$('engine').value==='auto'&&!!navigator.gpu;
 const device=wantGpu?'webgpu':'wasm';const model=MODEL_IDS[$('model').value];
 status('Loading AI model…',5);
 try{await request(worker,{type:'load',model,device})}catch(e){
  if(device!=='webgpu')throw e;
  status('GPU unavailable; restarting with CPU compatibility…',5);
  worker.terminate();worker=null;
  const fallbackUrl=URL.createObjectURL(new Blob([workerSource()],{type:'application/javascript'}));
  worker=new Worker(fallbackUrl,{type:'module'});URL.revokeObjectURL(fallbackUrl);
  try{await request(worker,{type:'load',model,device:'wasm'})}catch(cpuError){throw new Error('GPU failed ('+e.message+'); CPU fallback also failed ('+cpuError.message+'). Try Fast · Tiny with CPU compatibility.');}
 }
 segments=[];render();const total=Math.ceil(duration/SLICE_SECONDS);
 for(let i=0;i<total;i++){
  const begin=i*SLICE_SECONDS,end=Math.min(duration,begin+SLICE_SECONDS);
  status('Transcribing segment '+(i+1)+' of '+total+'…',12+82*(i/total));
  const data=ff?await convertSlice(ff,begin,end-begin):await resampleSlice(buffer,begin,end);
  const level=audioLevel(data);
  if(level<0.00003){
   // Silence can legitimately appear between speakers. Do not hallucinate it.
   diagnostic('Skipped silent audio section '+(i+1)+' of '+total+'.');status('Skipping silent segment '+(i+1)+' of '+total+'…',12+82*((i+1)/total));
   continue;
  }
  const response=await request(worker,{type:'segment',audio:data.buffer,id:i},[data.buffer]);
  if(!hasWords(response.result)){
   diagnostic('WARNING: AI returned no text for audio section '+(i+1)+'; audio level '+level.toFixed(5));
   console.warn('Empty model response for segment',i+1, 'RMS',level, 'response',response.result);
  }
  appendResult(response.result,begin,end-begin);
  render();
  diagnostic('Processed '+(i+1)+' of '+total+' audio sections · '+segments.length+' transcript sections produced.');status('Finished segment '+(i+1)+' of '+total,12+82*((i+1)/total));
 }
 if(!segments.length)throw new Error('AI returned no usable transcript text. Try Fast · Tiny / CPU, and see the diagnostic line below the progress bar.');
 render();if(!segments.length||$('download').disabled||!$('transcript').querySelector('.segment'))throw new Error('Transcript could not be displayed. No success was reported.');done=true;diagnostic('SUCCESS: '+segments.length+' transcript sections displayed; TXT download is enabled. Audio import: '+(ff?'automatic conversion':'browser decoder')+'.');status('Transcript ready — review before quoting',100);$('footer-note').textContent=segments.length+' transcript sections · review text before publication';notice('Transcription complete. Review and download your TXT file.');
}catch(err){console.error(err);diagnostic('FAILED: '+(err?.message||'Transcription failed'));status('Error: '+(err?.message||'Transcription failed'),0);notice((err?.message||'Something went wrong')+' Check the error details below.')}finally{busy=false;button.disabled=!selectedFile;button.textContent=done?'↻  Transcribe again':'✳  Try transcription again';$('remove').disabled=false;$('model').disabled=false;$('engine').disabled=false;decoded=null;if(audioContext){audioContext.close().catch(()=>{});audioContext=null}if(ffmpegInstance){ffmpegInstance.deleteFile('scribe-input').catch(()=>{})}render()}}
$('start').addEventListener('click',startManual);
function transcriptText(){return segments.map(s=>`[${stamp(s.start)}] ${speakers[s.speaker]||'Unassigned'}: ${s.text.trim()}`).join('\n\n')}
function render(){const t=$('transcript');t.replaceChildren();$('copy').disabled=!segments.length;$('download').disabled=!segments.length;$('add-speaker').disabled=!segments.length;$('search-area').style.display=segments.length?'flex':'none';
 if(!segments.length){$('count').textContent='0 sections';const div=document.createElement('div');div.className='empty';div.id='empty';div.innerHTML='<div class="empty-orbit">≋</div><h3>A blank page, for now.</h3><p>When your transcription is ready, you\'ll find the words here. Review, edit, play back and export.</p>';t.appendChild(div);return}
 const query=$('search').value.trim().toLowerCase();let showing=0;
 segments.forEach((s,i)=>{if(query&&!s.text.toLowerCase().includes(query)&&!(speakers[s.speaker]||'').toLowerCase().includes(query))return;showing++;const row=document.createElement('div');row.className='segment';const time=document.createElement('button');time.className='time';time.textContent=stamp(s.start);time.title='Play audio from here';time.onclick=()=>{const p=$('player');if(p.src){p.currentTime=s.start;p.play().catch(()=>notice('Click play in the audio player.'))}};row.appendChild(time);const main=document.createElement('div');main.className='segment-main';const header=document.createElement('div');header.className='speaker-row';const select=document.createElement('select');select.className='speaker-select';select.title='Manually assign a speaker';speakers.forEach((sp,j)=>{const option=document.createElement('option');option.value=j;option.textContent=sp;select.appendChild(option)});const unknown=document.createElement('option');unknown.value='-1';unknown.textContent='Unassigned';select.appendChild(unknown);select.value=String(s.speaker);select.onchange=()=>{s.speaker=Number(select.value)};header.appendChild(select);main.appendChild(header);const edit=document.createElement('textarea');edit.value=s.text;edit.rows=2;edit.setAttribute('aria-label','Transcript text at '+stamp(s.start));edit.addEventListener('input',()=>{s.text=edit.value});main.appendChild(edit);row.appendChild(main);t.appendChild(row)});$('count').textContent=showing+' / '+segments.length+' sections'}
$('search').addEventListener('input',render);
$('add-speaker').addEventListener('click',()=>{const value=prompt('Name for a new speaker (for example, Interviewer or Jane Smith):');if(!value?.trim())return;speakers.push(value.trim().slice(0,70));render();notice('Speaker added. Assign it using the dropdown beside transcript sections.')});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(transcriptText());notice('Transcript copied to clipboard.')}catch{notice('Could not copy. Try Download .txt instead.')}});
$('download').addEventListener('click',()=>{if(!segments.length)return;const base=(selectedFile?.name||'transcript').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9._ -]+/g,'_');const blob=new Blob([transcriptText()+'\n'],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=base+'-transcript.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notice('TXT download started.')});
$('player').addEventListener('error',()=>{if(selectedFile)notice('This browser may not support playback for this file format. Try MP3, M4A or WAV.')});
if(!navigator.gpu){$('model-note').textContent+=' This browser may use slower CPU processing because WebGPU is unavailable.'}
