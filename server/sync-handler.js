'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const Core=require('../dist/core.js');
const Sets=require('../dist/collections.js');
const MAX_BYTES=3*1024*1024;
function databaseFailure(error){
 const errors=[],seen=new Set();
 function visit(e){if(!e||typeof e!=='object'||seen.has(e)||seen.size>30)return;seen.add(e);errors.push(e);visit(e.cause);visit(e.reason);if(e.servers instanceof Map)for(const s of e.servers.values())visit(s.error);}
 visit(error);
 // Match locally; never expose raw driver messages, URIs or credentials.
 const has=(fn)=>errors.some(fn);
 if(has(e=>e.code===18||e.codeName==='AuthenticationFailed'||/authentication failed|bad auth/i.test(e.message||'')))return {code:'DB_AUTH',error:'MongoDB 用户名或密码验证失败。请更新 Vercel 的 MONGODB_URI 为正确用户名和新密码，并重新部署。'};
 if(has(e=>e.code===13||e.codeName==='Unauthorized'))return {code:'DB_PERMISSION',error:'数据库用户无权访问目标数据库。请检查 MONGODB_DB 以及该用户对它的读写权限。'};
 if(has(e=>e.name==='MongoParseError'||e.name==='MongoInvalidArgumentError'))return {code:'DB_URI',error:'MongoDB 连接字符串格式不正确。请检查占位符、首尾引号和密码中特殊字符的 URL 编码，然后重新部署。'};
 if(has(e=>['ENOTFOUND','ENODATA','ESERVFAIL'].includes(e.code)||/querySrv|queryTxt/.test(e.syscall||'')))return {code:'DB_DNS',error:'无法解析 MongoDB 集群地址。请从 Atlas 重新复制主机地址，确认集群仍在运行。'};
 if(has(e=>/TLS|SSL|CERT/i.test(String(e.code||'')+' '+String(e.message||''))))return {code:'DB_TLS',error:'与 MongoDB 建立加密连接失败。请检查 Atlas 集群状态和 Vercel 函数日志中的诊断码。'};
 if(has(e=>e.name==='MongoServerSelectionError'||e.name==='MongoNetworkError'||e.name==='MongoNetworkTimeoutError'||['ETIMEDOUT','ECONNREFUSED','ECONNRESET'].includes(e.code)))return {code:'DB_NETWORK',error:'无法连接 MongoDB 节点。请确认 Atlas IP Access List 已生效、集群未暂停，且连接字符串指向正确集群。'};
 return {code:'DB_UNAVAILABLE',error:'数据库操作失败。本机记录已保留，请提供此诊断码以继续排查。'};
}
function cleanState(raw){
  if(raw?.version!==2)throw Error('Unsupported state');
  const state=Sets.validate(raw,[],Core);
  state.draft=null;state.lastNotification=null;
  return state;
}
function authorized(header,key){
  if(typeof key!=='string'||key.length<32||typeof header!=='string'||header.length>1024)return false;
  const hash=v=>createHash('sha256').update(v).digest();
  return timingSafeEqual(hash(header),hash('Bearer '+key));
}
function createHandler({getCollection,env=process.env}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  const origin=req.headers.origin;
  const origins=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  // Vercel's assigned host is trusted configuration, not a client Host header.
  if(env.VERCEL_PROJECT_PRODUCTION_URL)origins.push('https://'+env.VERCEL_PROJECT_PRODUCTION_URL);
  if(origin&&!origins.includes(origin))return res.status(403).json({error:'此网页未获准连接同步服务。'});
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'不支持此操作。'});
  if(!env.PAROLE_SYNC_KEY||env.PAROLE_SYNC_KEY.length<32||!env.MONGODB_URI)return res.status(503).json({error:'后端尚未配置完成。'});
  if(!authorized(req.headers.authorization,env.PAROLE_SYNC_KEY))return res.status(401).json({error:'同步密钥不正确。'});
  let payload;
  if(req.method==='PUT'){
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return res.status(415).json({error:'需要 JSON 数据。'});
   try{
    const body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if(!body||Buffer.byteLength(body)>MAX_BYTES)return res.status(413).json({error:'学习数据超过 3 MB，请保留本地备份并扩展存储方案。'});
    payload=JSON.parse(body);
    if(!Number.isSafeInteger(payload.revision)||payload.revision<0)throw Error('revision');
    payload.state=cleanState(payload.state);
   }catch{return res.status(400).json({error:'学习数据格式无效，云端未修改。'});}
  }
  try{
   const col=await getCollection();
   if(req.method==='GET'){
    const doc=await col.findOne({_id:'personal'});
    return res.status(200).json(doc?{revision:doc.revision,state:doc.state,updatedAt:doc.updatedAt}:{revision:0,state:null});
   }
   const updatedAt=new Date().toISOString(),revision=payload.revision+1;
   // Atomic compare-and-set: a stale device can never overwrite newer data.
   if(payload.revision===0){
    try{await col.insertOne({_id:'personal',revision,state:payload.state,updatedAt});}
    catch(e){if(e.code===11000)return res.status(409).json({error:'云端已有新记录，请重新同步。'});throw e;}
   }else{
    const result=await col.updateOne({_id:'personal',revision:payload.revision},{$set:{revision,state:payload.state,updatedAt}});
    if(result.matchedCount!==1)return res.status(409).json({error:'云端已有新记录，请重新同步。'});
   }
   return res.status(200).json({revision,updatedAt});
  }catch(e){const failure=databaseFailure(e);console.error('Parole sync:',failure.code);return res.status(503).json(failure);}
 };
}
module.exports={createHandler,cleanState,authorized,MAX_BYTES,databaseFailure};
