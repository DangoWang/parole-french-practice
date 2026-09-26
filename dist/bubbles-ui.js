(function(root){'use strict';
function mount({getState,save,suffix=''}){
 const B=root.ParoleBubbles,pref='parole.bubbles.enabled'+suffix,clockKey='parole.bubbles.last'+suffix;
 const zh=()=>root.ParoleUI?.language()==='zh',t=(cn,en)=>zh()?cn:en;
 let enabled=matchMedia('(min-width: 768px) and (pointer: fine)').matches,current=null,expanded=false,editing=null,last=Date.now(),filter='active';
 try{const p=localStorage.getItem(pref);if(p!==null)enabled=p==='true';last=Math.max(last,Number(localStorage.getItem(clockKey))||0);}catch{}
 const items=()=>getState().bubbles||[];
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(cn,en,fn,cls='secondary')=>{const b=el('button',cls,t(cn,en));b.type='button';b.onclick=fn;return b;};
 const content=(tag,text)=>{const n=el(tag,'',text);n.setAttribute('data-study-content','');n.dir='auto';return n;};
 const host=el('aside','bubble-widget');host.setAttribute('aria-label','Quick review');document.body.append(host);
 const launch=button('气泡便签','Quick notes',openEditor,'bubble-launch');launch.title=t('添加内容 · 管理气泡','Add a note · Manage bubbles');host.append(launch);
 const pop=el('section','bubble-pop');pop.hidden=true;pop.setAttribute('aria-live','polite');host.prepend(pop);
 const dialog=el('dialog','bubble-manager');document.body.append(dialog);
 const heading=el('div','dialog-head'),title=el('h2'),close=button('关闭','Close',()=>dialog.close(),'text-button');heading.append(title,close);dialog.append(heading);
 const form=el('form','bubble-form'),text=el('textarea'),meaning=el('textarea');text.required=true;text.maxLength=2000;meaning.maxLength=2000;text.rows=3;meaning.rows=2;
 const label=el('label'),mlabel=el('label');label.append(text);mlabel.append(meaning);form.append(label,mlabel);
 const actions=el('div'),submit=el('button','primary'),cancelEdit=button('取消编辑','Cancel edit',()=>clearEditor(),'text-button');submit.type='submit';actions.append(submit,cancelEdit);form.append(actions);dialog.append(form);
 const message=el('p','muted');message.setAttribute('role','status');dialog.append(message);
 const search=el('input');search.type='search';search.oninput=renderList;const select=el('select');for(const value of ['active','paused','deleted','all']){const o=el('option');o.value=value;select.append(o);}select.onchange=()=>{filter=select.value;renderList();};const toolbar=el('div','bubble-toolbar');toolbar.append(search,select);dialog.append(toolbar);
 const list=el('div','bubble-list');dialog.append(list);
 const settings=el('section','settings-section bubble-settings'),stitle=el('h3'),toggleLabel=el('label'),toggle=el('input'),toggleText=el('span'),help=el('p','muted');toggle.type='checkbox';toggle.checked=enabled;toggleLabel.append(toggle,toggleText);const manage=button('管理气泡内容','Manage bubble notes',()=>openEditor());settings.append(stitle,toggleLabel,help,manage);document.getElementById('settings-dialog').append(settings);
 function commit(updated){getState().bubbles=B.validate(updated);save();render();renderList();}
 function resetClock(){last=Date.now();try{localStorage.setItem(clockKey,String(last));}catch{}}
 function dismiss(){if(current){const id=current;current=null;commit(items().map(x=>x.id===id?{...x,due:Math.max(x.due,Date.now()+B.CADENCE)}:x));}expanded=false;resetClock();render();}
 toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(pref,String(enabled));}catch{}dismiss();};
 function clearEditor(){editing=null;text.value='';meaning.value='';submit.textContent=t('添加气泡','Add bubble');cancelEdit.hidden=true;}
 function openEditor(){if(document.getElementById('settings-dialog').open)document.getElementById('settings-dialog').close();localize();if(!dialog.open)dialog.showModal();renderList();text.focus();}
 form.onsubmit=e=>{e.preventDefault();try{if(editing){if(!items().some(x=>x.id===editing&&!x.deleted))throw Error(t('内容已被删除，请重新添加。','This note was deleted. Add it again.'));commit(items().map(x=>x.id===editing?{...x,text:text.value.trim(),meaning:meaning.value.trim()}:x));}else{if(items().length>=2000)throw Error(t('最多保存 2000 条气泡。','Up to 2,000 bubble notes.'));commit([...items(),B.create(text.value,meaning.value)]);}clearEditor();message.textContent=t('已保存，下次气泡将按队列提醒。','Saved. It will appear when due.');}catch(err){message.textContent=err.message;}};
 function time(due){return due<=Date.now()?t('已到期','Due now'):new Date(due).toLocaleString(zh()?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
 function renderList(){
  if(!dialog.open)return;list.replaceChildren();const q=search.value.trim().toLocaleLowerCase();const rows=items().filter(x=>(filter==='all'||filter==='deleted'?filter==='all'||x.deleted:!x.deleted&&(filter==='paused'?x.paused:!x.paused))&&(!q||(x.text+' '+x.meaning).toLocaleLowerCase().includes(q)));
  if(!rows.length){list.append(el('p','muted',t('没有符合条件的内容。','No matching notes.')));return;}
  for(const x of rows.slice(0,100)){const row=el('article','bubble-item');row.append(content('strong',x.text),content('p',x.meaning),el('p','muted',x.deleted?t('已删除，可恢复','Deleted · can be restored'):x.paused?t('已暂停','Paused'):t('下次：','Next: ')+time(x.due)));const bar=el('div');
   const change=patch=>commit(items().map(y=>y.id===x.id?{...y,...patch}:y));
   if(x.deleted)bar.append(button('恢复','Restore',()=>change({deleted:false})));
   else bar.append(button('编辑','Edit',()=>{editing=x.id;text.value=x.text;meaning.value=x.meaning;submit.textContent=t('保存修改','Save changes');cancelEdit.hidden=false;text.focus();}),button(x.paused?'继续':'暂停',x.paused?'Resume':'Pause',()=>change({paused:!x.paused})),button('删除','Delete',()=>change({deleted:true}),'text-button'));
   row.append(bar);list.append(row);
  }if(rows.length>100)list.append(el('p','muted',t('仅显示前 100 条，请搜索缩小范围。','Showing the first 100. Search to narrow results.')));
 }
 function render(){
  host.hidden=!enabled;launch.textContent=t('气泡便签','Quick notes');const item=items().find(x=>x.id===current&&!x.deleted&&!x.paused);if(!item){current=null;pop.hidden=true;return;}
  pop.hidden=false;pop.replaceChildren();const top=el('div','bubble-pop-head');top.append(el('small','muted',t('想一想，这是什么意思？','Can you recall this?')),button('稍后','Later',dismiss,'text-button'));pop.append(top);
  const reveal=button('','',()=>{expanded=true;render();},'bubble-prompt');reveal.append(content('span',item.text));pop.append(reveal);
  if(!expanded){pop.append(el('small','muted',t('点击内容，查看解释并反馈','Click the note to reveal and rate')));return;}
  if(item.meaning)pop.append(content('p',item.meaning));const ratings=el('div','bubble-ratings');for(const [value,cn,en] of [['easy','太简单','Too easy'],['again','不认识','Unknown'],['hard','模糊','Unsure'],['good','认识','Known']]){const predicted=B.schedule(item,value);const b=button(cn,en,()=>{const actual=items().find(x=>x.id===current&&!x.deleted&&!x.paused);if(!actual){current=null;render();return;}const id=actual.id;current=null;expanded=false;resetClock();commit(items().map(x=>x.id===id?B.schedule(x,value):x));});b.title=t('下次：','Next: ')+time(predicted.due);ratings.append(b);}pop.append(ratings,button('添加 / 管理','Add / manage',openEditor,'text-button'));
 }
 function tick(){
  if(current&&!items().some(x=>x.id===current&&!x.deleted&&!x.paused))render();
  if(!enabled||document.hidden||!document.hasFocus()||document.querySelector('dialog[open]')||current||document.getElementById('voice-stop')?.hidden===false)return;
  try{last=Math.max(last,Number(localStorage.getItem(clockKey))||0);}catch{}
  if(Date.now()-last<B.CADENCE)return;const item=B.next(items());if(!item)return;
  resetClock();current=item.id;expanded=false;commit(items().map(x=>x.id===item.id?{...x,lastShown:Date.now()}:x));
 }
 function localize(){close.textContent=t('关闭','Close');cancelEdit.textContent=t('取消编辑','Cancel edit');launch.setAttribute('aria-label',t('添加 / 管理气泡','Add / manage bubble notes'));launch.title=t('添加 / 管理气泡','Add / manage bubble notes');title.textContent=t('气泡内容','Bubble notes');stitle.textContent=t('高频气泡复习','Quick bubble reviews');toggleText.textContent=t('开启气泡提醒（仅此设备）','Enable bubbles on this device');help.textContent=t('每 5 分钟最多提醒一条到期内容。仅在当前网页显示；不占每日练句数量。首次：不认识 5 分钟、模糊 10 分钟、认识 30 分钟、太简单 1 天。','At most one due note every 5 minutes, within this page. Separate from daily practice. First intervals: Unknown 5 min, Unsure 10 min, Known 30 min, Too easy 1 day.');manage.textContent=t('管理气泡内容','Manage bubble notes');label.firstChild===text&&label.prepend(el('span'));label.firstChild.textContent=t('内容（单词、句子或任意笔记）','Content (word, sentence or any note)');mlabel.firstChild===meaning&&mlabel.prepend(el('span'));mlabel.firstChild.textContent=t('解释 / 提示（可选，点击后显示）','Meaning / hint (optional, revealed on click)');search.placeholder=t('搜索气泡内容','Search bubble notes');search.setAttribute('aria-label',search.placeholder);select.setAttribute('aria-label',t('状态','Status'));['练习中','已暂停','已删除','全部'].forEach((cn,i)=>select.options[i].textContent=t(cn,['Active','Paused','Deleted','All'][i]));submit.textContent=editing?t('保存修改','Save changes'):t('添加气泡','Add bubble');render();renderList();}
 dialog.addEventListener('close',()=>{clearEditor();message.textContent='';});document.addEventListener('visibilitychange',tick);window.addEventListener('parole-ui-change',localize);window.addEventListener('storage',e=>{if(e.key===pref){enabled=e.newValue==='true';toggle.checked=enabled;render();}});setInterval(tick,1000);clearEditor();localize();return {refresh:()=>{render();renderList();}};
}
root.ParoleBubbleUI={mount};
})(globalThis);
