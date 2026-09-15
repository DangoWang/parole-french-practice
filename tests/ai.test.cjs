const test=require('node:test');
const assert=require('node:assert/strict');
const AI=require('../dist/ai.js');
const C=require('../dist/core.js');
const card={zh:'我建议你预订。',fr:'Je te conseille de réserver.',group:'旅行'};
const feedback={score:10,explanation:'同义表达正确。',corrected:'Je te recommande de réserver.',errors:[]};
const response=v=>({ok:true,json:async()=>({status:'completed',output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:JSON.stringify(v)}]}]})});
test('request sends only the current exercise to OpenAI; key stays in authorization header',async()=>{
 let request;
 const result=await AI.grade({key:'test-credential',card,answer:feedback.corrected,fetchImpl:async(url,options)=>{request={url,...options};return response(feedback);}});
 assert.deepEqual(result,feedback);assert.equal(request.url,'https://api.openai.com/v1/responses');
 assert.equal(request.headers.Authorization,'Bearer test-credential');assert.ok(!request.body.includes('test-credential'));
 const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.model,'gpt-4o-mini');assert.equal(body.text.format.strict,true);
 assert.deepEqual(Object.keys(JSON.parse(body.input)).sort(),['answer','context','meaning','reference']);
 assert.equal(request.redirect,'error');assert.equal(request.credentials,'omit');
});
test('API error bodies cannot leak secrets into the user-visible error',async()=>{
 for(const [status,code,expected] of [[401,'invalid_api_key',/密钥无效/],[429,'insufficient_quota',/额度不足/],[429,'rate_limit_exceeded',/过于频繁/],[403,'forbidden',/权限/],[500,'error',/暂时不可用/]]){
  await assert.rejects(AI.grade({key:'test-credential',card,answer:'Bonjour',fetchImpl:async()=>({ok:false,status,json:async()=>({error:{code,message:'secret should never appear'}})})}),e=>expected.test(e.message)&&!e.message.includes('secret'));
 }
});
test('refusal, incomplete and malformed replies never become a score',()=>{
 assert.throws(()=>AI.parseResponse({status:'incomplete',output:[]}));
 assert.throws(()=>AI.parseResponse({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}));
 for(const v of [{...feedback,score:11},{...feedback,score:4.5},{...feedback,errors:[{quote:2}]}])assert.throws(()=>AI.validateFeedback(v));
});
test('cancelling and timing out abort the actual fetch',async()=>{
 const fetchImpl=(_,options)=>new Promise((resolve,reject)=>{if(options.signal.aborted)reject(new DOMException('Aborted','AbortError'));else options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 const controller=new AbortController();const pending=AI.grade({key:'test',card,answer:'Bonjour',signal:controller.signal,fetchImpl});controller.abort();await assert.rejects(pending,{name:'AbortError'});
 await assert.rejects(AI.grade({key:'test',card,answer:'Bonjour',fetchImpl,timeoutMs:5}),/超过/);
});
test('highlight preserves exact answer and merges overlapping quoted spans',()=>{
 const answer='Je suis aller <script> ici.';
 const parts=AI.highlightParts(answer,[{quote:'suis aller'},{quote:'aller'},{quote:'missing'},{quote:''}]);
 assert.equal(parts.map(p=>p.text).join(''),answer);assert.deepEqual(parts.filter(p=>p.error),[{text:'suis aller',error:true}]);
});
test('credential persistence is separate from study backups and can be deleted',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 AI.saveConfig(storage,' test-credential ',true);assert.deepEqual(AI.loadConfig(storage),{key:'test-credential',enabled:true});
 const state=C.initialState();assert.ok(!JSON.stringify(state).includes('test-credential'));const imported=C.validateState({...state,apiKey:'test-credential'},new Set());assert.ok(!JSON.stringify(imported).includes('test-credential'));
 AI.clearConfig(storage);assert.deepEqual(AI.loadConfig(storage),{key:'',enabled:false});
});
test('empty answers do not make a billable call and network failures are actionable',async()=>{
 let called=false;await assert.rejects(AI.grade({key:'test',card,answer:' ',fetchImpl:()=>{called=true;}}));assert.equal(called,false);
 await assert.rejects(AI.grade({key:'test',card,answer:'Bonjour',fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),/网络/);
});
