(async()=>{'use strict';
 const ORIGIN='https://parole-french-practice-8chh.vercel.app';
 const box=document.createElement('section');box.className='settings-section';box.id='account-section';
 document.getElementById('sync-title').parentElement.before(box);
 const heading=document.createElement('h3');heading.textContent='Google 账户';box.append(heading);
 const status=document.createElement('p');status.setAttribute('role','status');box.append(status);
 const accountButton=document.createElement('button');accountButton.className='subtle';accountButton.textContent='Google 登录';document.getElementById('profile-actions').append(accountButton);
 accountButton.onclick=()=>{document.getElementById('settings-open').click();box.scrollIntoView({block:'start'});};
 const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.onclick=action;box.append(b);return b;};
 const launch=()=>{const script=document.createElement('script');script.src='app.js?v=voice-confirm-1';document.body.append(script);};
 if(location.origin!==ORIGIN){status.textContent='登录 Google 账户后同步学习记录。';button('打开 Google 登录版',()=>location.assign(ORIGIN));launch();return;}
 async function request(path,options={}){const r=await fetch('/api/auth/'+path,{...options,credentials:'same-origin',cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'无法连接登录服务。');return data;}
 try{
  const {user}=await request('session');window.ParoleAccount=user;
  if(user){
   accountButton.textContent='账户 · '+(user.name||user.email);
   status.textContent='已登录：'+user.email;
   const key='parole.study.v2.'+user.id;
   const r=await fetch('/api/sync',{headers:{'X-Parole-Account':user.id},credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('无法读取账户数据，请刷新重试。');
   const remote=await r.json();let local=localStorage.getItem(key);
   if(!local&&remote.state){const valid=window.ParoleCollections.validate(remote.state,window.PAROLE_DECK,window.ParoleCore);localStorage.setItem(key,JSON.stringify(valid));const hash=await window.ParoleSync.fingerprint(valid);localStorage.setItem(window.ParoleSync.META+'.'+user.id,JSON.stringify({url:ORIGIN,revision:remote.revision,hash}));}
   button('退出登录',async()=>{try{await request('logout',{method:'POST'});localStorage.setItem('parole.account-event',String(Date.now()));location.reload();}catch(e){status.textContent=e.message;}});
  }else{
   status.textContent=new URLSearchParams(location.search).has('auth_error')?'登录未完成，请重新尝试。':'登录后按账户同步句集、笔记和学习进度。';
   accountButton.onclick=()=>location.assign('/api/auth/login');button('使用 Google 登录',()=>location.assign('/api/auth/login'));
  }
  window.addEventListener('storage',e=>{if(e.key==='parole.account-event')location.reload();});
  launch();
 }catch(e){status.textContent=e.message;document.getElementById('storage-warning').hidden=false;document.getElementById('storage-warning').textContent='账户数据加载失败，为保护进度已暂停练习。请刷新重试。';button('重新连接',()=>location.reload());}
})();
