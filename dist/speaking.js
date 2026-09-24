(function(root){'use strict';
const Languages=root.ParoleLanguages||(typeof require==='function'?require('./languages.js'):null);
const MODEL='gpt-audio-1.5';
function pcmWav(samples,rate=24000){const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);const word=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};word(0,'RIFF');view.setUint32(4,36+samples.length*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++){const n=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,n<0?n*32768:n*32767,true);}return bytes;}
async function toWav(blob){
 const Context=root.AudioContext||root.webkitAudioContext;if(!Context||!root.OfflineAudioContext)throw Error('此浏览器无法处理录音，请使用最新版 Chrome。');
 const context=new Context();let decoded;try{decoded=await context.decodeAudioData(await blob.arrayBuffer());}catch{throw Error('无法读取这段录音，请重新录制。');}finally{await context.close();}
 if(!decoded.length||decoded.duration>125)throw Error('请使用不超过 2 分钟的录音。');
 const offline=new root.OfflineAudioContext(1,Math.ceil(decoded.duration*24000),24000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const rendered=await offline.startRendering();return pcmWav(rendered.getChannelData(0));
}
function requestBody(audio,card,languages=Languages.get()){return {model:MODEL,modalities:['text'],store:false,max_completion_tokens:2200,messages:[{role:'system',content:Languages.audioPrompt(languages)},{role:'user',content:[{type:'text',text:JSON.stringify({exerciseMeaning:card.zh,scenario:card.group,referenceExample:card.fr,context:card.note})},{type:'input_audio',input_audio:{data:audio,format:'wav'}}]}]};}
async function assess({key,wav,card,signal,languages=Languages.get(),fetchImpl=fetch}){
 if(!key)throw Error('请先在学习设置中保存 API Key。');if(!wav?.byteLength||wav.byteLength>7000000)throw Error('录音为空或过大，请重新录制。');
 const bytes=new Uint8Array(wav);let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;abort();},60000);
 try{const response=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.trim()},body:JSON.stringify(requestBody(btoa(raw),card,languages)),signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error(response.status===401?'API Key 无效，请检查设置。':response.status===429?'请求过多或额度不足，请稍后重试。':response.status===403||response.status===404?'当前 Key 无法使用音频反馈模型，请检查模型权限。':'口语反馈请求失败，请稍后重试。');
 const data=await response.json(),choice=data.choices?.[0];if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string'||!choice.message.content.trim()||choice.message.refusal)throw Error('未收到完整口语反馈，请重试。');return parseFeedback(choice.message.content);
 }catch(e){if(signal?.aborted)throw new DOMException('已取消','AbortError');if(timedOut)throw Error('口语反馈超时，请重试。');if(e instanceof TypeError)throw Error('无法连接 OpenAI，请检查网络。');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function parseFeedback(text){
 let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Error('口语评分格式不完整，请重试。');}
 const caps={accurate:10,partial:6,wrong:4,unassessable:0};
 const fields=['heard','meaningFeedback','naturalness','pronunciation','improved','rationale'];
 if(!value||!Object.hasOwn(caps,value.meaning)||!(value.score===null||Number.isInteger(value.score)&&value.score>=1&&value.score<=10)||fields.some(k=>typeof value[k]!=='string'||!value[k].trim()||value[k].length>4000))throw Error('口语评分格式不完整，请重试。');
 if(value.meaning!=='unassessable'&&value.score===null)throw Error('口语评分缺少分数，请重试。');
 const score=value.meaning==='unassessable'?null:Math.min(value.score,caps[value.meaning]);
 const verdict={accurate:'意思准确',partial:'意思部分到位',wrong:'核心意思偏离',unassessable:'暂时无法判断'}[value.meaning];
 return {score,sections:[['听到的表达：',value.heard],['1. 意思是否准确 · '+verdict,value.meaningFeedback],['2. 口语是否自然',value.naturalness],['3. 发音与清晰度',value.pronunciation],['4. 更自然的临场表达',value.improved+'\n'+value.rationale]],feedback:`听到的表达：${value.heard.trim()}\n\n1. 意思是否准确 · ${verdict}\n${value.meaningFeedback.trim()}\n\n2. 口语是否自然\n${value.naturalness.trim()}\n\n3. 发音与清晰度\n${value.pronunciation.trim()}\n\n4. 更自然的临场表达\n${value.improved.trim()}\n${value.rationale.trim()}`};
}
function mount({getKey,getCard,onScore=()=>{}}){
 const $=id=>document.getElementById(id),box=$('speaking-feedback'),run=$('speaking-run'),cancel=$('speaking-cancel'),result=$('speaking-result'),status=$('speaking-status'),player=$('speaking-player');let blob=null,url=null,card=null,generation=0,controller=null,languages=Languages.get();
 function reset(){generation++;controller?.abort();controller=null;blob=null;card=null;player.pause();player.removeAttribute('src');player.load();if(url)URL.revokeObjectURL(url);url=null;box.hidden=true;run.disabled=false;cancel.hidden=true;result.textContent='';status.textContent='';}
 function capture(recording){reset();blob=recording;card=getCard();languages=Languages.get();url=URL.createObjectURL(blob);player.src=url;box.hidden=false;status.textContent='本次录音已就绪';}
 async function evaluate(){if(!blob||!card||controller)return;const id=generation,source=blob,requestCard=card;controller=new AbortController();const signal=controller.signal;run.disabled=true;cancel.hidden=false;result.textContent='';status.textContent='正在听录音，分析口语表现…';
 try{const key=getKey();if(!key)throw Error('请先在学习设置中保存 API Key。');const wav=await toWav(source);if(id!==generation||signal.aborted)return;const feedback=await assess({key,wav,card:requestCard,signal,languages});if(id!==generation||getCard()!==requestCard)return;result.replaceChildren();for(const [label,content] of feedback.sections){const h=document.createElement('h4'),p=document.createElement('p');h.textContent=label;p.textContent=content;p.setAttribute('data-study-content','');p.dir='auto';result.append(h,p);}status.textContent=(feedback.score===null?'本次录音无法评分':'口语建议 '+feedback.score+' / 10')+' · '+MODEL;onScore(feedback.score);}
 catch(e){if(id===generation)status.textContent=e.name==='AbortError'?'已取消，可以重新获取反馈。':e.message;}
 finally{if(id===generation){controller=null;run.disabled=false;cancel.hidden=true;}}};
 run.onclick=evaluate;
 cancel.onclick=()=>{controller?.abort();status.textContent='已取消，可以重新获取反馈。';};return {reset,capture,evaluate,hasRecording:()=>!!blob};
}
const api={MODEL,pcmWav,toWav,requestBody,parseFeedback,assess,mount};if(typeof module!=='undefined')module.exports=api;else root.ParoleSpeaking=api;
})(globalThis);
