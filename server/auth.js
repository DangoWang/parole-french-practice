'use strict';
const {randomBytes,createHash}=require('node:crypto');
const {OAuth2Client}=require('google-auth-library');
const SESSION='__Host-parole-session',FLOW='__Host-parole-flow';
const token=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex');
function origin(env=process.env){return env.PAROLE_AUTH_ORIGIN||'https://parole-french-practice-8chh.vercel.app';}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));}
function cookie(name,value,seconds){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;}
function sameOrigin(req,env){return req.headers.origin===origin(env);}
async function session(req,db){const value=cookies(req)[SESSION];if(!/^[\w-]{43}$/.test(value||''))return null;return db.collection('authSessions').findOne({_id:hash(value),expiresAt:{$gt:new Date()}});}
function makeAuth({getDatabase,env=process.env,clientFactory=()=>new OAuth2Client(env.google_oauth_client_id,env.google_oauth_client_secret,origin(env)+'/api/auth/callback/google')}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const action=req.query?.action;
  try{
   if(!env.google_oauth_client_id||!env.google_oauth_client_secret||!env.MONGODB_URI)return res.status(503).json({error:'Google 登录尚未配置完成。'});
   const db=await getDatabase();
   if(action==='session'&&req.method==='GET'){
    const s=await session(req,db);return res.status(200).json({user:s?{id:s.userId,email:s.email,name:s.name}:null});
   }
   if(action==='login'&&req.method==='GET'){
    const state=token(),verifier=token(),nonce=token(),client=clientFactory();
    await db.collection('authFlows').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await db.collection('authFlows').insertOne({_id:hash(state),verifier,nonce,expiresAt:new Date(Date.now()+600000)});
    res.setHeader('Set-Cookie',cookie(FLOW,state,600));
    const url=client.generateAuthUrl({scope:['openid','email','profile'],state,nonce,prompt:'select_account',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    return res.redirect(302,url);
   }
   if(action==='callback/google'&&req.method==='GET'){
    const {state,code}=req.query;
    if(typeof state!=='string'||state!==cookies(req)[FLOW]||!/^[\w-]{43}$/.test(state)||typeof code!=='string')return res.redirect(302,origin(env)+'/?auth_error=cancelled');
    const flow=await db.collection('authFlows').findOneAndDelete({_id:hash(state),expiresAt:{$gt:new Date()}});
    if(!flow)return res.redirect(302,origin(env)+'/?auth_error=expired');
    const client=clientFactory(),{tokens}=await client.getToken({code,codeVerifier:flow.verifier});
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:env.google_oauth_client_id});const p=ticket.getPayload();
    if(!p?.sub||p.nonce!==flow.nonce||p.email_verified!==true)throw Error('invalid_identity');
    const secret=token();await db.collection('authSessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
    const old=cookies(req)[SESSION];if(old)await db.collection('authSessions').deleteOne({_id:hash(old)});
    await db.collection('authSessions').insertOne({_id:hash(secret),userId:'google-'+p.sub,email:p.email,name:p.name||p.email,expiresAt:new Date(Date.now()+30*86400000)});
    res.setHeader('Set-Cookie',[cookie(SESSION,secret,30*86400),cookie(FLOW,'',0)]);
    return res.redirect(302,origin(env)+'/');
   }
   if(action==='logout'&&req.method==='POST'){
    if(!sameOrigin(req,env))return res.status(403).json({error:'请从应用内退出。'});
    const value=cookies(req)[SESSION];if(value)await db.collection('authSessions').deleteOne({_id:hash(value)});
    res.setHeader('Set-Cookie',cookie(SESSION,'',0));return res.status(200).json({ok:true});
   }
   if(action==='migrate'&&req.method==='POST'){
    if(!sameOrigin(req,env))return res.status(403).json({error:'请从应用内迁移。'});
    const s=await session(req,db);if(!s)return res.status(401).json({error:'请先登录。'});
    const {authorized}=require('./sync-handler');if(!authorized(req.headers.authorization,env.PAROLE_SYNC_KEY))return res.status(403).json({error:'原同步密钥不正确，未迁移任何记录。'});
    const study=db.collection('study'),legacy=await study.findOne({_id:'personal'});
    if(!legacy)return res.status(404).json({error:'没有旧版云端记录。'});
    if(await study.findOne({_id:s.userId}))return res.status(409).json({error:'当前账户已有云端数据。为避免覆盖，请使用备份导入并比较记录。'});
    // Unique claim prevents another Google account from taking the same legacy data.
    try{await db.collection('authClaims').insertOne({_id:'personal',userId:s.userId});}catch(e){if(e.code!==11000)throw e;const claim=await db.collection('authClaims').findOne({_id:'personal'});if(claim.userId!==s.userId)return res.status(409).json({error:'旧记录已关联另一个账户。'});}
    try{await study.insertOne({_id:s.userId,revision:1,state:legacy.state,updatedAt:new Date().toISOString(),migratedFrom:'personal'});}catch(e){if(e.code!==11000)throw e;return res.status(409).json({error:'当前账户已有云端数据。为避免覆盖，请使用备份导入并比较记录。'});}
    return res.status(200).json({ok:true});
   }
   return res.status(405).json({error:'不支持此操作。'});
  }catch{console.error('Parole auth: AUTH_FAILED');return res.status(503).json({error:'登录服务暂时不可用，请检查 Google 回调地址、环境变量或数据库连接。'});}
 };
}
module.exports={makeAuth,session,origin,sameOrigin,hash,cookie,SESSION,FLOW};
