(function(root){'use strict';
const CONFIG='parole.sync.config.v1',META='parole.sync.meta.v1';
function snapshot(state){return JSON.parse(JSON.stringify({...state,draft:null,lastNotification:null}));}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
async function fingerprint(state){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(snapshot(state))))),x=>x.toString(16).padStart(2,'0')).join('');}
function endpoint(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/','/api/sync'].includes(u.pathname))throw Error('请输入 HTTPS 后端网址，例如 https://你的项目.vercel.app');return u.origin;}
function decide(localHash,remoteHash,meta,revision){if(localHash===remoteHash)return 'same';if(!remoteHash)return meta?.revision?'conflict':'push';if(!meta)return 'conflict';if(localHash===meta.hash)return 'pull';if(revision===meta.revision)return 'push';return 'conflict';}
function create({storage,getState,applyState,validate,onStatus=()=>{},onConflict=()=>{},fetchImpl=fetch}){
 let config=null,meta=null,busy=false,timer,generation=0,controller,conflict=null,again=false;
 try{config=JSON.parse(storage.getItem(CONFIG));meta=JSON.parse(storage.getItem(META));if(config){config.url=endpoint(config.url);if(typeof config.key!=='string'||config.key.length<32)config=null;}if(meta?.url!==config?.url)meta=null;}catch{config=null;meta=null;}
 const status=message=>onStatus(message,!!config);
 function loadMeta(){try{const m=JSON.parse(storage.getItem(META));meta=m?.url===config?.url?m:null;}catch{meta=null;}}
 function saveMeta(revision,hash){meta={url:config.url,revision,hash};storage.setItem(META,JSON.stringify(meta));}
 async function request(method,body){
  const signal=controller.signal,timeout=setTimeout(()=>controller?.abort(),20000);
  try{
   const r=await fetchImpl(config.url+'/api/sync',{method,headers:{Authorization:'Bearer '+config.key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});
   if(!r.ok){const e=Error(r.status===401?'同步密钥不正确，请重新连接。':r.status===409?'云端刚有更新，请再次点击同步。':r.status===413?'数据超过同步大小限制，请导出备份。':'连接失败，请检查后端配置、网络访问和网址。');e.status=r.status;throw e;}
   const data=await r.json();if(!Number.isSafeInteger(data.revision)||data.revision<0)throw Error('同步服务返回了无效数据。');return data;
  }finally{clearTimeout(timeout);}
 }
 async function sync(choice){
  if(!config)return;if(busy){again=true;return;}if(conflict&&!choice)return;
  busy=true;again=false;const token=generation;controller=new AbortController();status('正在同步…');
  try{
   loadMeta();const remote=await request('GET');if(token!==generation)return;
   if(remote.state!==null)remote.state=validate(remote.state);
   const local=snapshot(getState()),localHash=await fingerprint(local),remoteHash=remote.state?await fingerprint(remote.state):null;
   if(token!==generation)return;
   // Hashing is asynchronous; never apply a remote snapshot over a concurrent edit.
   if(canonical(snapshot(getState()))!==canonical(local)){again=true;return;}
   let action=decide(localHash,remoteHash,meta,remote.revision);
   if(choice){
    if(!conflict||conflict.revision!==remote.revision||conflict.localHash!==localHash){choice=null;}
    else action=choice;
   }
   if(action==='conflict'){
    conflict={local,remote:remote.state,localHash,revision:remote.revision};onConflict(conflict);status('两份记录不同，已暂停同步，请在设置中选择。');return;
   }
   if(action==='pull'){
    if(!choice&&getState().draft?.answer){status('云端有更新，完成当前句子后同步。');return;}
    if(!remote.state)throw Error('云端为空，不能替换本机记录。');
    // Keep the local draft; it is intentionally not synced across devices.
    applyState({...remote.state,draft:getState().draft,lastNotification:getState().lastNotification});
    saveMeta(remote.revision,remoteHash);
   }else if(action==='push'){
    const response=await request('PUT',{revision:remote.revision,state:local});if(token!==generation)return;
    saveMeta(response.revision,localHash);
   }else saveMeta(remote.revision,localHash);
   conflict=null;onConflict(null);status('已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
  }catch(e){if(token===generation)status(e.name==='AbortError'?'同步超时，本机记录已保留。':e.message);}
  finally{busy=false;controller=null;if(again&&token===generation)changed();}
 }
 function changed(){if(!config)return;clearTimeout(timer);timer=setTimeout(()=>sync(),4000);}
 function disconnect(){generation++;controller?.abort();clearTimeout(timer);config=null;meta=null;conflict=null;storage.removeItem(CONFIG);storage.removeItem(META);onConflict(null);status('未连接云端 · 记录保存在本机');}
 function connect(url,key){url=endpoint(url);if(typeof key!=='string'||key.trim().length<32)throw Error('同步密钥至少 32 个字符，请使用后端配置的随机密钥。');generation++;controller?.abort();config={url,key:key.trim()};storage.setItem(CONFIG,JSON.stringify(config));loadMeta();conflict=null;onConflict(null);status('连接已保存，点击「立即同步」开始。');}
 status(config?'已连接 · 等待同步':'未连接云端 · 记录保存在本机');
 return {changed,sync,connect,disconnect,getConfig:()=>config?{url:config.url}:null,getConflict:()=>conflict};
}
const api={snapshot,canonical,fingerprint,endpoint,decide,create,CONFIG,META};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ParoleSync=api;
})(typeof window!=='undefined'?window:globalThis);
