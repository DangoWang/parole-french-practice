(function(root){'use strict';
const Languages=root.ParoleLanguages||(typeof require==='function'?require('./languages.js'):null);
async function transcribe({key,blob,signal,language=Languages.get().targetLanguage,fetchImpl=fetch}){
 if(!key)throw new Error('请先在学习设置中保存 OpenAI API Key。');
 if(!blob?.size)throw new Error('没有录到声音，请重新录音。');
 if(blob.size>24000000)throw new Error('录音过大，请缩短后重试。');
 const form=new FormData();form.append('model','gpt-4o-mini-transcribe');form.append('language',Languages.normalize({targetLanguage:language}).targetLanguage);form.append('response_format','json');
 form.append('file',blob,'parole.'+(blob.type.includes('mp4')?'mp4':blob.type.includes('ogg')?'ogg':'webm'));
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,60000);
 try{
  const response=await fetchImpl('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:controller.signal});
  if(!response.ok)throw new Error(response.status===401?'API Key 无效，请检查学习设置。':response.status===429?'额度不足或请求过于频繁，请稍后重试。':'转写失败，请检查网络和模型访问权限后重试。');
  const data=await response.json();if(typeof data.text!=='string'||!data.text.trim())throw new Error('没有识别到文字，请清晰说出目标语言后重试。');return data.text.trim();
 }catch(e){if(signal?.aborted)throw new DOMException('已取消','AbortError');if(controller.signal.aborted)throw new Error('转写超时，请重试。');if(e instanceof TypeError)throw new Error('无法连接 OpenAI，请检查网络后重试。');throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function mount({getKey,canRecord,onText,onStart=()=>{},onRecording=()=>{},document:doc=document,media=navigator.mediaDevices,Recorder=globalThis.MediaRecorder}){
 const $=id=>doc.getElementById(id),toggle=$('voice-enabled'),panel=$('voice-panel'),start=$('voice-start'),stop=$('voice-stop'),cancel=$('voice-cancel'),retry=$('voice-retry'),status=$('voice-status');
 let generation=0,stream=null,recorder=null,timer=null,controller=null,audio=null,busy=false;
 function release(){clearInterval(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
 function buttons(active=false){busy=active;start.disabled=active;stop.hidden=true;cancel.hidden=!active;retry.hidden=true;}
 function display(){panel.hidden=!toggle.checked;$('answer').hidden=toggle.checked;}
 function reset(keepMode=false){if(!keepMode)toggle.checked=false;display();generation++;controller?.abort();controller=null;if(recorder?.state==='recording')recorder.stop();recorder=null;release();audio=null;buttons();status.textContent='点击开始录音，用目标语言表达。';}
 async function send(blob,id){controller=new AbortController();buttons(true);status.textContent='正在转写录音…';try{const text=await transcribe({key:getKey(),blob,signal:controller.signal});if(id!==generation||!canRecord())return;toggle.checked=false;display();onText(text);audio=null;status.textContent='已填入表达输入框，可修改后确认。';}catch(e){if(id!==generation)return;status.textContent=e.message;}finally{if(id===generation){controller=null;buttons();retry.hidden=!audio;}}}
 toggle.onchange=()=>{reset(true);};
 start.onclick=async()=>{
  if(busy||!canRecord()){status.textContent='请先开始一道尚未确认的练习。';return;}
  if(!getKey()){status.textContent='请先在学习设置中保存 OpenAI API Key。';return;}
  if(!media?.getUserMedia||!Recorder){status.textContent='当前浏览器不支持录音，请使用 Chrome 打开 HTTPS 线上版。';return;}
  onStart();reset(true);const id=generation;buttons(true);status.textContent='等待麦克风授权…';
  try{const acquired=await media.getUserMedia({audio:true});if(id!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;
   const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].find(t=>Recorder.isTypeSupported(t));
   recorder=new Recorder(stream,mime?{mimeType:mime}:undefined);const chunks=[],recording=recorder;let bytes=0;
   recording.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>=23000000&&recording.state==='recording')recording.stop();}};
   recording.onerror=()=>{if(id!==generation)return;reset(true);status.textContent='录音失败，请检查麦克风后重试。';};
   recording.onstop=()=>{if(id!==generation)return;release();recorder=null;audio=new Blob(chunks,{type:recording.mimeType||mime||'audio/webm'});onRecording(audio);send(audio,id);};
   recording.start(1000);stop.hidden=false;const began=Date.now();status.textContent='录音中 · 0 秒';timer=setInterval(()=>{const seconds=Math.floor((Date.now()-began)/1000);status.textContent='录音中 · '+seconds+' / 120 秒';if(seconds>=120&&recording.state==='recording')recording.stop();},1000);
  }catch(e){if(id!==generation)return;release();buttons();status.textContent=e.name==='NotAllowedError'?'未获得麦克风权限，请在地址栏的网站权限中允许麦克风。':'无法使用麦克风，请检查设备后重试。';}
 };
 stop.onclick=()=>{if(recorder?.state==='recording'){stop.disabled=true;recorder.stop();stop.disabled=false;}};
 cancel.onclick=()=>{reset(true);status.textContent='已取消，本次录音已丢弃。';};retry.onclick=()=>{if(audio&&!busy&&canRecord())send(audio,generation);};
 return {reset};
}
const api={transcribe,mount};if(typeof module!=='undefined')module.exports=api;else root.ParoleVoice=api;
})(globalThis);
