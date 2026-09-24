(function(root){'use strict';
const Languages=root.ParoleLanguages||(typeof require==='function'?require('./languages.js'):null);
const STORAGE_KEY='parole.openai.v1';
const MODEL='gpt-4o-mini';
const ENDPOINT='https://api.openai.com/v1/responses';
const schema={type:'object',additionalProperties:false,required:['score','explanation','corrected','errors'],properties:{
 score:{type:'integer',minimum:1,maximum:10},explanation:{type:'string'},corrected:{type:'string'},
 errors:{type:'array',items:{type:'object',additionalProperties:false,required:['quote','replacement','reason'],properties:{quote:{type:'string'},replacement:{type:'string'},reason:{type:'string'}}}}
}};
function requestBody(card,answer,languages=Languages.get()){return {model:MODEL,store:false,max_output_tokens:1200,instructions:Languages.textPrompt(languages),input:JSON.stringify({meaning:card.zh,context:{category:card.group,usage:card.note||''},reference:card.fr,answer}),text:{format:{type:'json_schema',name:'language_sentence_feedback',strict:true,schema}}};}
function validateFeedback(v){
 if(!v||!Number.isInteger(v.score)||v.score<1||v.score>10||typeof v.explanation!=='string'||v.explanation.length>4000||typeof v.corrected!=='string'||v.corrected.length>4000||!Array.isArray(v.errors)||v.errors.length>20||v.errors.some(e=>!e||['quote','replacement','reason'].some(k=>typeof e[k]!=='string'||e[k].length>4000)))throw Error('AI 返回的评分格式不完整，请重试或自行评分。');
 return {score:v.score,explanation:v.explanation,corrected:v.corrected,errors:v.errors.map(e=>({quote:e.quote,replacement:e.replacement,reason:e.reason}))};
}
function parseResponse(body){
 if(body.status!=='completed')throw Error('AI 未完成评分，请重试或自行评分。');
 const content=(body.output||[]).flatMap(o=>o.type==='message'?(o.content||[]):[]);
 if(content.some(c=>c.type==='refusal'))throw Error('AI 未能评估这句话，你仍可自行评分。');
 try{return validateFeedback(JSON.parse(content.filter(c=>c.type==='output_text').map(c=>c.text).join('')));}catch{throw Error('AI 返回的评分格式不完整，请重试或自行评分。');}
}
function httpError(status,code){
 if(status===401)return '密钥无效或已撤销，请在 AI 设置中更换。';
 if(status===429)return code==='insufficient_quota'?'API 额度不足，请检查 OpenAI API 余额与计费设置。':'请求过于频繁，请稍后手动重试。';
 if(status===403)return '此密钥没有调用权限，或当前地区不支持此服务。';
 if(status===404)return '当前项目无法使用 GPT-4o mini，请检查模型访问权限。';
 if(status>=500)return 'OpenAI 服务暂时不可用，请稍后重试。';
 return '评分请求未成功（HTTP '+status+'），你仍可自行评分。';
}
async function grade({key,card,answer,signal,languages=Languages.get(),fetchImpl=globalThis.fetch,timeoutMs=45000}){
 if(!key||!key.trim())throw Error('请先在 AI 设置中保存 API Key。');
 if(!answer.trim()||answer.length>2000)throw Error('请输入 1–2000 个字符的表达。');
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  const response=await fetchImpl(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.trim()},body:JSON.stringify(requestBody(card,answer,languages)),signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
  let body;try{body=await response.json();}catch{if(!response.ok)throw Error(httpError(response.status));throw Error('服务返回了无法读取的结果，请稍后重试。');}
  if(!response.ok)throw Error(httpError(response.status,body?.error?.code));
  return parseResponse(body);
 }catch(e){
  if(controller.signal.aborted){if(timedOut)throw Error('评分超过 45 秒，请手动重试或自行评分。');throw new DOMException('Cancelled','AbortError');}
  if(e instanceof TypeError)throw Error('浏览器无法读取 OpenAI 响应，可能是网络或跨域拦截。若开发者工具显示 401，请在学习设置中重新保存有效的 API Key 并测试连接；页面无法读取被拦截响应的具体原因。');
  throw e;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
function loadConfig(storage){try{const v=JSON.parse(storage.getItem(STORAGE_KEY)||'null');return {key:typeof v?.key==='string'?v.key:'',enabled:v?.enabled===true};}catch{return {key:'',enabled:false};}}
function saveConfig(storage,key,enabled){storage.setItem(STORAGE_KEY,JSON.stringify({key:key.trim(),enabled:!!enabled}));}
function clearConfig(storage){storage.removeItem(STORAGE_KEY);}
// Mark only exact quoted spans. Never interpret model text as HTML or regex.
function highlightParts(answer,errors){
 const ranges=[];for(const e of errors){if(!e.quote)continue;let offset=0,index;while((index=answer.indexOf(e.quote,offset))!==-1){ranges.push([index,index+e.quote.length]);offset=index+e.quote.length;}}
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
 const result=[];let end=0;for(const [a,b] of merged){if(a>end)result.push({text:answer.slice(end,a),error:false});result.push({text:answer.slice(a,b),error:true});end=b;}if(end<answer.length)result.push({text:answer.slice(end),error:false});return result;
}
const api={STORAGE_KEY,MODEL,ENDPOINT,requestBody,validateFeedback,parseResponse,httpError,grade,loadConfig,saveConfig,clearConfig,highlightParts};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ParoleAI=api;
})(typeof window!=='undefined'?window:globalThis);
