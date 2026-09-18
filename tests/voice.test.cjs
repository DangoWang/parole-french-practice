const {test}=require('node:test');const assert=require('node:assert/strict');const V=require('../dist/voice.js');
test('French transcription sends multipart audio only and preserves text',async()=>{
 const text=await V.transcribe({key:'test-secret',blob:new Blob(['audio'],{type:'audio/webm'}),fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer test-secret');assert.equal(options.body.get('language'),'fr');assert.equal(options.body.get('model'),'gpt-4o-mini-transcribe');assert.equal(options.body.get('file').name,'parole.webm');assert.equal(options.body.get('prompt'),null);return {ok:true,json:async()=>({text:' Bonjour à tous. '})};}});assert.equal(text,'Bonjour à tous.');
});
test('invalid input does not call API; server errors do not expose response secrets',async()=>{
 await assert.rejects(V.transcribe({key:'',blob:new Blob(['x']),fetchImpl:()=>assert.fail()}),/API Key/);
 await assert.rejects(V.transcribe({key:'x',blob:new Blob([]),fetchImpl:()=>assert.fail()}),/没有录到/);
 await assert.rejects(V.transcribe({key:'x',blob:new Blob(['x']),fetchImpl:async()=>({ok:false,status:401,json:()=>({secret:'secret'})})}),/API Key 无效/);
});
test('cancel propagates to request and ignores late microphone permission',async()=>{
 const controller=new AbortController();const pending=V.transcribe({key:'x',blob:new Blob(['x']),signal:controller.signal,fetchImpl:async(u,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('cancel'))))});controller.abort();await assert.rejects(pending,{name:'AbortError'});
 const elements={};const doc={getElementById:id=>elements[id]??=( {hidden:false,disabled:false,checked:true,textContent:''})};let grant,stopped=0;
 const voice=V.mount({getKey:()=> 'x',canRecord:()=>true,onText:()=>assert.fail(),document:doc,media:{getUserMedia:()=>new Promise(r=>grant=r)},Recorder:class {}});
 const start=elements['voice-start'].onclick();voice.reset();grant({getTracks:()=>[{stop(){stopped++;}}]});await start;assert.equal(stopped,1);assert.equal(elements['voice-start'].disabled,false);
});
