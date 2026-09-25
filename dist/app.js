(()=>{'use strict';
window.PAROLE_SITE_URL="https://parole-french-practice-8chh.vercel.app";
const C=window.ParoleCore,Sets=window.ParoleCollections,seed=window.PAROLE_DECK;
let deck=[],ids=new Set(),byId={},groupNames=[];let libraryUI;
const ACCOUNT=window.ParoleAccount,SUFFIX=ACCOUNT?'.'+ACCOUNT.id:'',KEY='parole.study.v2'+SUFFIX,LEGACY_KEY=ACCOUNT?KEY:'parole.study.v1', $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let state=Sets.initial(seed,C),current=null,revealed=false,chosen=null,mode='daily',scope='all',view='practice',extra=false,manual=false,libraryPage=0,toastTimer,storageBlocked=false;

let voice,speaking,cloud,inputWasVoice=false,oralScore=null;
const speakingPanel=$('speaking-feedback');
const hints=window.ParoleHints.mount(document);
const AI=window.ParoleAI;
let aiConfig={key:'',enabled:false},aiResult=null,aiError='',aiBusy=false,aiController=null,aiGeneration=0,scoreTouched=false,testController=null;
try{aiConfig=AI.loadConfig(localStorage);}catch{}
function cancelAI(){aiGeneration++;aiController?.abort();aiController=null;aiBusy=false;}
function resetAI(){$('exercise').append(speakingPanel);inputWasVoice=false;oralScore=null;speaking?.reset();voice?.reset();cancelAI();aiResult=null;aiError='';scoreTouched=false;}
function refreshAISettings(message){
 $('ai-key').value='';$('ai-enabled').checked=aiConfig.enabled;
 $('ai-settings-status').textContent=message||(aiConfig.key?'已保存密钥 · '+(aiConfig.enabled?'自动评分已开启':'自动评分已关闭'):'尚未设置密钥，仍可使用匹配建议和自评分。');
}
function renderAI(){
 const box=$('ai-feedback');if(!box)return;if(inputWasVoice){const panel=speakingPanel;if(panel.nextElementSibling!==box)box.before(panel);box.hidden=!!speaking?.hasRecording();box.innerHTML=box.hidden?'':'<p>录音已释放，请自行评分，或重新录音。</p>';return;}box.hidden=false;
 if(aiBusy){box.innerHTML='<p role="status">正在评估意思、语法和自然度…</p><button class="text-button" id="ai-cancel">取消评分</button>';$('ai-cancel').onclick=()=>{cancelAI();aiError='已取消评分，可以自行给分。';renderAI();};return;}
 if(aiResult){
  const marked=AI.highlightParts($('answer').value,aiResult.errors).map(p=>p.error?'<mark>'+esc(p.text)+'</mark>':esc(p.text)).join('');
  box.innerHTML='<h3>AI 建议 '+aiResult.score+' / 10 <small>GPT-4o mini</small></h3><p data-study-content>'+esc(aiResult.explanation)+'</p><div class="diff ai-answer" lang="fr">'+marked+'</div>'+(aiResult.errors.length?'<ul>'+aiResult.errors.map(e=>'<li><span data-study-content lang="fr">'+esc(e.quote||'缺少表达')+' → '+esc(e.replacement)+'</span><br><span data-study-content>'+esc(e.reason)+'</span>'+'</li>').join('')+'</ul>':'<p>AI 未发现需要修改的地方。</p>')+'<div class="result-label">尽量保留原句的修改建议</div><div class="reference"><p lang="fr">'+esc(aiResult.corrected)+'</p></div><p class="muted">AI 判断可能有误，不是官方 TCF 分数。'+(scoreTouched?'已保留你的自评分。':'建议分数已填入，你可以调整。')+'</p>';
  return;
 }
 box.innerHTML='<h3>AI 句子评分</h3>'+(aiError?'<p class="ai-error" role="status">'+esc(aiError)+'</p>':'<p>判断意思、语法与自然度；正确的同义表达也可以得高分。</p>')+(aiConfig.key?'<button class="secondary" id="ai-run">'+(aiError?'重试 AI 评分':'获取 AI 评分')+'</button>':'<button class="secondary" id="ai-configure">设置 API Key</button>');
 $('ai-run')?.addEventListener('click',runAI);$('ai-configure')?.addEventListener('click',()=>{openSettings();$('ai-settings-title').scrollIntoView({block:'start'});});
}
async function runAI(){
 if(inputWasVoice||!current||!revealed||aiBusy||!$('answer').value.trim())return;
 cancelAI();const generation=aiGeneration,card=current,answer=$('answer').value;const controller=new AbortController();aiController=controller;aiBusy=true;aiError='';renderAI();
 try{const feedback=await AI.grade({key:aiConfig.key,card,answer,signal:controller.signal});
  if(generation!==aiGeneration||current!==card||$('answer').value!==answer)return;
  aiResult=feedback;if(!scoreTouched)chosen=feedback.score;aiBusy=false;renderResult();persistDraft();
 }catch(e){if(generation!==aiGeneration)return;aiBusy=false;if(e.name!=='AbortError')aiError=e.message;renderAI();}
 finally{if(generation===aiGeneration){aiBusy=false;aiController=null;}}
}
function setupAISettings(){
 $('ai-save').onclick=()=>{
  const key=$('ai-key').value.trim()||aiConfig.key,enabled=$('ai-enabled').checked;
  if(enabled&&!key){$('ai-settings-status').textContent='请先输入 API Key。';return;}
  try{AI.saveConfig(localStorage,key,enabled);aiConfig={key,enabled};cancelAI();testController?.abort();refreshAISettings('已保存到当前浏览器。'+(enabled?'下次确认答案时自动评分。':'自动评分已关闭。'));renderAI();}catch{$('ai-settings-status').textContent='浏览器未能保存密钥，请检查网站存储权限。';}
 };
 $('ai-clear').onclick=()=>{cancelAI();testController?.abort();try{AI.clearConfig(localStorage);aiConfig={key:'',enabled:false};refreshAISettings('已删除本机保存的密钥；不会撤销 OpenAI 平台上的 Key。');renderAI();}catch{$('ai-settings-status').textContent='无法删除，请在浏览器网站设置中清除本网站数据。';}};
 $('ai-test').onclick=async()=>{
  const key=$('ai-key').value.trim()||aiConfig.key;if(!key){$('ai-settings-status').textContent='请先输入 API Key。';return;}
  if(testController)return;const controller=new AbortController();testController=controller;$('ai-test').disabled=true;$('ai-settings-status').textContent='正在发送一个示例句子，测试会产生少量 API 费用…';
  try{const r=await AI.grade({key,card:{zh:'我建议你提前预订。',fr:'Je te conseille de réserver à l’avance.',group:'旅行'},answer:'Je te recommande de réserver à l’avance.',signal:controller.signal,languages:{sourceLanguage:'zh',targetLanguage:'fr'}});if(!controller.signal.aborted)$('ai-settings-status').textContent='连接成功 · GPT-4o mini · 示例句评分 '+r.score+'/10。'+($('ai-key').value.trim()?'请点击保存 AI 设置以启用。':'');}
  catch(e){if(e.name!=='AbortError')$('ai-settings-status').textContent=e.message;}
  finally{testController=null;$('ai-test').disabled=false;}
 };
 $('settings-dialog').addEventListener('close',()=>{$('ai-key').value='';testController?.abort();});
 window.addEventListener('storage',e=>{if(e.key===AI.STORAGE_KEY||e.key===null){cancelAI();testController?.abort();try{aiConfig=AI.loadConfig(localStorage);}catch{aiConfig={key:'',enabled:false};}if($('settings-dialog').open)refreshAISettings();renderAI();}});
 refreshAISettings();
}
setupAISettings();
speaking=window.ParoleSpeaking.mount({getKey:()=>aiConfig.key,getCard:()=>current,onScore:score=>{oralScore=score;if(revealed&&inputWasVoice&&!scoreTouched&&score!==null){chosen=score;renderResult();persistDraft();}}});
voice=window.ParoleVoice.mount({onStart:()=>{speaking.reset();oralScore=null;},onRecording:blob=>{inputWasVoice=true;cancelAI();speaking.capture(blob);},getKey:()=>aiConfig.key,canRecord:()=>!!current&&!revealed&&view==='practice',onText:text=>{const input=$('answer');const combined=[input.value.trim(),text].filter(Boolean).join(' ');if(combined.length>input.maxLength){toast('转写后内容超过 2000 字符，请精简输入后重新录音。');return;}input.value=combined;input.dispatchEvent(new Event('input'));input.focus();}});
window.addEventListener('pagehide',()=>{voice.reset();speaking.reset();});

function warning(message){$('storage-warning').hidden=false;$('storage-warning').textContent=message;}
try{const raw=localStorage.getItem(KEY)||localStorage.getItem(LEGACY_KEY);if(raw)state=Sets.validate(JSON.parse(raw),seed,C);}catch(e){storageBlocked=true;warning('暂时无法读取学习记录，原数据不会被覆盖。你仍可练习并导出本次备份；请检查浏览器存储设置，或导入有效备份。');}
function persist(){window.ParoleLanguages.set(state.settings);if(storageBlocked)return false;try{localStorage.setItem(KEY,JSON.stringify(state));cloud?.changed();return true;}catch{warning('浏览器未能保存进度。本次页面中的记录仍在，请在「学习设置与备份」中导出备份。');return false;}}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function when(timestamp){if(timestamp<=Date.now())return '现在到期';const minutes=Math.ceil((timestamp-Date.now())/60000);if(minutes<=60)return `${minutes} 分钟后`;if(C.dayKey(timestamp)===C.dayKey(C.dayAfter(1)))return '明天';return new Intl.DateTimeFormat((window.ParoleUI?.locale()||'en-US'),{month:'short',day:'numeric'}).format(timestamp);}
function nextCopy(p){return p.stage==='learning'&&p.interval===0?'10 分钟后复习':`${when(p.due)}复习${p.interval>1?` · 间隔 ${p.interval} 天`:''}`;}
function stats(){const counts=C.dailyCounts(state.history),today=counts.newIds,reviewed=counts.reviewIds,due=C.dueCards(deck,state.progress),learned=deck.filter(c=>state.progress[c.id]).length;let streak=0;const days=new Set(state.history.map(h=>C.dayKey(h.at)));let d=new Date();if(!days.has(C.dayKey(d)))d.setDate(d.getDate()-1);while(days.has(C.dayKey(d))){streak++;d.setDate(d.getDate()-1);}return {today,reviewed,due,learned,streak};}
let historyLimit=20,historyRef=null,historyLength=-1,historyRenderedLimit=0,historyCardId=null;
function diffMarkup(answer,reference,side='reference'){
 const tokens=side==='answer'?C.wordDiff(reference,answer):C.wordDiff(answer,reference);
 return tokens.map(t=>t.match?esc(t.word):'<mark>'+esc(t.word)+'</mark>').join(' ');
}
function historyAnswer(h,card){
 if(typeof h.answer!=='string')return '<p class="history-empty">旧记录未保存当次输入内容</p>';
 if(!h.answer.trim())return '<p class="history-empty">当次未输入表达（暂时想不起来）</p>';
 const reference=h.reference||card?.fr||'';
 const typed='<div class="diff history-answer" lang="fr">'+diffMarkup(h.answer,reference,'answer')+'</div>';
 const different=!C.match(h.answer,reference).exact;
 return typed+(different?'<details class="history-reference"><summary>查看参考表达中的差异</summary><div class="diff" lang="fr">'+diffMarkup(h.answer,reference)+'</div></details>':'');
}
function renderNotes(){const input=$('sentence-notes');input.disabled=!current;input.value=current?(state.notes[current.id]||''):'';$('notes-status').textContent=current?(input.value?'已保存':'自动保存'):'请选择句子';}
$('sentence-notes').addEventListener('input',()=>{if(!current)return;const text=$('sentence-notes').value;if(text)state.notes[current.id]=text;else delete state.notes[current.id];$('notes-status').textContent=persist()?'已保存':'保存失败，请导出备份';});
function renderHistory(){
 const cardId=current?.id||null,changed=historyCardId!==cardId;
 if(changed)historyLimit=20;
 if(!changed&&historyRef===state.history&&historyLength===state.history.length&&historyRenderedLimit===historyLimit)return;
 historyCardId=cardId;historyRef=state.history;historyLength=state.history.length;historyRenderedLimit=historyLimit;
 const entries=state.history.map((entry,index)=>({entry,index})).filter(({entry})=>entry.id===cardId).sort((a,b)=>b.entry.at-a.entry.at||b.index-a.index);
 const list=$('practice-history'),scroll=changed?0:list.scrollTop;
 $('history-count').textContent=entries.length+' 次';
 if(!entries.length){list.innerHTML='<p class="history-empty">'+(cardId?'这是这句话的第一次练习，还没有历史评分。':'开始练习后，这里会显示当前句子的历史评分。')+'</p>';}else{
 const formatter=new Intl.DateTimeFormat((window.ParoleUI?.locale()||'en-US'),{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 list.innerHTML='<ol>'+entries.slice(0,historyLimit).map(({entry:h})=>{const card=byId[h.id];const tone=h.score<=5?'low':h.score>=9?'high':'medium';return '<li class="history-entry"><div class="history-meta"><time datetime="'+esc(new Date(h.at).toISOString())+'">'+esc(formatter.format(h.at))+'</time><span class="history-score '+tone+'" aria-label="得分 '+h.score+' 分">'+h.score+'<small>/10</small></span></div>'+historyAnswer(h,card)+'<span class="history-card-label">'+esc(h.id+(card?' · '+card.group:''))+'</span></li>';}).join('')+'</ol>';
 }
 list.scrollTop=scroll;$('history-more').hidden=entries.length<=historyLimit;
}
$('history-more').addEventListener('click',()=>{historyLimit+=20;renderHistory();});
function updateStats(){document.querySelector('.nav-item[data-view="library"] small').textContent=state.catalog.sets.filter(s=>!s.deleted).length+' 集';renderHistory();const s=stats();$('today-date').textContent=new Intl.DateTimeFormat((window.ParoleUI?.locale()||'en-US'),{month:'long',day:'numeric',weekday:'long'}).format(new Date());$('streak').textContent=s.streak;$('today-count').textContent=s.today.size;$('daily-goal').textContent=state.settings.goal;$('due-count').textContent=s.due.length;$('due-chip').textContent=s.due.length;$('learned-count').textContent=s.learned;$('goal-progress').style.width=Math.min(100,s.today.size/state.settings.goal*100)+'%';$('progress-caption').textContent=(s.today.size>=state.settings.goal?(s.due.length?'新学目标已完成，请继续完成到期复习。':'新学目标已完成。'):`还需首次练习 ${state.settings.goal-s.today.size} 条新句。`)+` 今日已复习 ${s.reviewed.size} 条，不占新学名额。`;
const counts=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return {day:d.getDate(),count:new Set(state.history.filter(h=>C.dayKey(h.at)===C.dayKey(d)).map(h=>h.id)).size};});const max=Math.max(state.settings.goal,...counts.map(x=>x.count));$('week-chart').innerHTML=counts.map((x,i)=>`<div class="week-day" title="${x.day} 日：${x.count} 条"><div class="week-bar" style="height:${Math.max(4,66*x.count/max)}%"></div><span>${i===6?'今天':x.day}</span></div>`).join('');}
function allowed(){return scope==='all'?deck:deck.filter(c=>c.group===scope);}
function nextCard(){return C.nextPracticeCard(deck,state,{mode,scope,extra});}
function persistDraft(){if(current)state.draft={id:current.id,answer:$('answer').value,revealed,score:chosen,inputMode:inputWasVoice?'voice':'text'};persist();}
function showCard(card,restore){resetAI();inputWasVoice=restore?.inputMode==='voice';current=card;renderHistory();renderNotes();revealed=!!restore?.revealed;hints.reset(revealed);chosen=restore?.score||null;$('exercise').hidden=false;$('empty-state').hidden=true;$('card-kind').textContent=manual?'单条练习':state.progress[card.id]?'到期复习':'新表达';$('card-kind').className='tag'+(state.progress[card.id]?' review':'');$('card-group').textContent=(state.catalog.sets.find(s=>s.id===card.setId)?.name||'')+' · '+card.group+(card.star?' · 优先掌握':'');$('card-id').textContent=card.id;$('prompt').textContent=card.zh;$('answer').value=restore?.answer||'';$('answer').readOnly=revealed;$('answer').maxLength=2000;$('answer').placeholder='在这里写下你的表达…';$('word-count').textContent=($('answer').value.trim()?$('answer').value.trim().split(/\s+/).length:0)+' 词';$('answer-form').querySelector('.action-row').hidden=revealed;$('result').hidden=!revealed;$('result').innerHTML='';$('reveal').disabled=!$('answer').value.trim();if(revealed)renderResult();else if(view==='practice')setTimeout(()=>$('answer').focus({preventScroll:true}),30);}
function empty(){resetAI();current=null;hints.reset(true,false);renderHistory();renderNotes();$('exercise').hidden=true;$('empty-state').hidden=false;const st=stats(),list=allowed(),scheduled=deck.filter(c=>state.progress[c.id]).sort((a,b)=>state.progress[a.id].due-state.progress[b.id].due);const laterToday=scheduled.filter(c=>state.progress[c.id].due>Date.now()&&C.dayKey(state.progress[c.id].due)===C.dayKey());let title,body,button;
if(mode==='daily'&&!extra&&st.today.size>=state.settings.goal){title=laterToday.length?'新学完成，稍后还有复习':'今天的新学与到期复习已完成';body='今天首次练习了 '+st.today.size+' 条新句，另外复习了 '+st.reviewed.size+' 条。'+(laterToday.length?'还有 '+laterToday.length+' 条将在今天稍后到期，请届时完成。':'');button='<button class="primary" id="continue-extra">再学一些新句 →</button>';}
else{title=mode==='due'?'当前到期复习已完成':'这一组暂时没有新句了';body=(scheduled.length?'下一条复习：'+when(state.progress[scheduled[0].id].due)+'。':'新句评分后会自动生成复习安排。')+' 到期复习不占每日新学名额，且优先于所有类别的新句。';button=mode==='due'?'<button class="primary" id="switch-daily">继续每日新学 →</button>':'<button class="primary" id="browse-library">看看其他表达 →</button>';}
if(!deck.length){title='先选择要练习的句集';body='在表达库中勾选一个或多个句集，并添加表达。未选中的句集会暂停出题和复习。';button='<button class="primary" id="browse-library">选择句集 →</button>';}
$('empty-state').innerHTML='<div class="empty-icon">✓</div><h2>'+title+'</h2><p>'+body+'</p>'+button;$('continue-extra')?.addEventListener('click',()=>{extra=true;chooseNext();});$('switch-daily')?.addEventListener('click',()=>setMode('daily'));$('browse-library')?.addEventListener('click',()=>showView('library'));}
function chooseNext(){manual=false;const card=nextCard();if(card)showCard(card);else empty();updateStats();}
function revealAnswer(skip=false){if(!current||revealed)return;if(!skip&&!$('answer').value.trim())return;voice?.reset();revealed=true;hints.reset(true);chosen=skip?1:inputWasVoice?oralScore:C.match($('answer').value,current.fr).score;$('answer').readOnly=true;$('answer-form').querySelector('.action-row').hidden=true;$('result').hidden=false;renderResult();persistDraft();if(!skip){if(inputWasVoice){if(oralScore===null)speaking.evaluate();}else if(aiConfig.enabled&&aiConfig.key)runAI();}}
function proposed(){const prior=state.progress[current.id];if(manual&&prior&&prior.due>Date.now()&&chosen>=6)return {record:prior,early:true};return {record:C.schedule(prior,chosen),early:false};}
function renderResult(){const m=C.match($('answer').value,current.fr);if(!inputWasVoice)chosen=chosen||m.score;const hint=m.exact?'与参考表达一致（忽略大小写和标点）。':m.accentOnly?'表达一致，请留意重音符号。':'仅比较文字匹配度，不判断同义表达是否正确。你可以调整评分。';const diff=m.exact?'':`<details class="note"><summary>查看参考表达中的差异</summary><div class="diff" lang="fr">${diffMarkup($('answer').value,current.fr)}</div><p>高亮的是未匹配的参考词语，不代表你的替代表达一定有错。</p></details>`;
// Preserve the mounted audio player and feedback when the score rerenders.
$('exercise').append(speakingPanel);
$('result').innerHTML=`<div class="result-label">参考表达</div><div class="reference"><p lang="fr">${esc(current.fr)}</p></div><p class="note" data-study-content>${esc(current.note)}</p>${inputWasVoice?'':`<div class="match-row"><span class="match-score">匹配建议 ${m.score} / 10</span><span class="match-hint">${hint}</span></div>${diff}`}<section id="ai-feedback" class="ai-feedback"></section><div class="score-title">${inputWasVoice?'你的最终评分（可自行修改 AI 建议）':'这次，你觉得自己掌握了几分？'}</div><div class="score-buttons" role="group" aria-label="自评分 1 至 10">${Array.from({length:10},(_,i)=>`<button class="score-button${chosen===i+1?' chosen':''}" data-score="${i+1}" aria-pressed="${chosen===i+1}">${i+1}</button>`).join('')}</div><div class="score-key"><span>1–3 想不起来</span><span>4–6 还不熟练</span><span>7–9 基本掌握</span><span>10 完美</span></div><p class="next-preview" id="next-preview"></p><div class="save-row"><span class="muted">以你的最终评分安排复习</span><button class="primary" id="save-score" ${chosen?'':'disabled'}>保存评分，下一条 →</button></div>`;
$('result').querySelectorAll('[data-score]').forEach(btn=>btn.addEventListener('click',()=>{scoreTouched=true;chosen=Number(btn.dataset.score);$('save-score').disabled=false;$('result').querySelectorAll('[data-score]').forEach(b=>{b.classList.toggle('chosen',Number(b.dataset.score)===chosen);b.setAttribute('aria-pressed',String(Number(b.dataset.score)===chosen));});updatePreview();persistDraft();renderAI();}));$('save-score').addEventListener('click',saveScore);updatePreview();renderAI();}
function updatePreview(){if(!chosen){$('next-preview').textContent='等待口语建议分数，也可以先自行评分。';return;}const p=proposed();$('next-preview').textContent=p.early?`这是提前练习，保持原计划：${when(p.record.due)}复习。`:`下次安排：${nextCopy(p.record)}。`;}
function saveScore(){if(!current||!revealed||!chosen)return;const id=current.id,score=chosen,p=proposed();state.progress[id]=p.record;state.history.push({id,at:Date.now(),score,answer:$('answer').value,reference:current.fr});state.draft=null;persist();toast(`已记录 ${score} 分 · ${p.early?'保留原复习日期':nextCopy(p.record)}`);chooseNext();}
function setMode(next){mode=next;extra=false;state.draft=null;persist();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));chooseNext();}
function showView(next){speaking?.reset();voice?.reset();view=next;['practice','library','plan'].forEach(v=>$(v+'-view').hidden=v!==next);document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===next));$('page-title').textContent={practice:'把想说的话，表达出来。',library:'每一种场景，都有话可说。',plan:'让记忆，在合适的时候回来。'}[next];if(next==='library')renderLibrary();if(next==='plan')renderPlan();if(next==='practice'){updateStats();if(!current)chooseNext();}}
function startSingle(id){if(!deck.some(c=>c.id===id)){toast('此句集已暂停或表达已删除，请在表达库中加入练习。');return;}const due=C.dueCards(deck,state.progress);if(due.length){showView('practice');manual=false;showCard(due[0]);persistDraft();toast('请先完成到期复习；复习不占每日新学名额。');return;}manual=true;extra=true;showView('practice');manual=true;showCard(byId[id]);persistDraft();window.scrollTo({top:0,behavior:'smooth'});}
function renderLibrary(){libraryUI.render();}
function renderLibraryResults(){libraryUI.refresh();}
function renderPlan(){const s=stats(),activeProgress=deck.filter(c=>state.progress[c.id]).map(c=>state.progress[c.id]),weak=activeProgress.filter(p=>p.lastScore<=5).length;const days=Array.from({length:7},(_,i)=>{const start=i===0?0:C.dayAfter(i),end=C.dayAfter(i+1);return {label:i===0?'今天':i===1?'明天':new Intl.DateTimeFormat((window.ParoleUI?.locale()||'en-US'),{month:'numeric',day:'numeric'}).format(start),count:activeProgress.filter(p=>p.due>=start&&p.due<end).length};});const max=Math.max(1,...days.map(d=>d.count));const next=deck.filter(c=>state.progress[c.id]).sort((a,b)=>state.progress[a.id].due-state.progress[b.id].due).slice(0,12);
$('plan-view').innerHTML=`<div class="plan-top"><div class="plan-stat"><span>现在到期</span><strong>${s.due.length}</strong></div><div class="plan-stat"><span>需要巩固</span><strong>${weak}</strong></div><div class="plan-stat"><span>已选句集已学</span><strong>${s.learned}<span> / ${deck.length}</span></strong></div></div><div class="plan-grid"><section class="panel"><h2>未来 7 天</h2><p class="metric-caption">仅统计已选句集，含今天的逾期内容；未选中的句集已暂停。</p>${days.map(d=>`<div class="schedule-row"><span>${d.label}</span><div class="schedule-line"><div style="width:${d.count/max*100}%"></div></div><b>${d.count} 条</b></div>`).join('')}<button class="primary" id="plan-review">开始到期复习 →</button></section><section class="panel"><h2>你的分数，决定下一次相遇</h2><div class="rule-row"><b>1–3 分</b><span>10 分钟后再试</span></div><div class="rule-row"><b>4–5 分</b><span>明天复习，重新巩固</span></div><div class="rule-row"><b>6–7 分</b><span>首次隔 1 天</span></div><div class="rule-row"><b>8 / 9 / 10 分</b><span>首次隔 2 / 3 / 4 天</span></div><p>连续答对后逐步拉长间隔；分数越高，增长越快。10 分不代表永久毕业。算法参考 SM-2，针对 1–10 分和句子练习作了调整。</p><a class="text-button" href="https://super-memory.org/archive/english/ol/sm2.htm" target="_blank" rel="noopener">查看算法参考 ↗</a></section></div><section class="panel review-list"><div class="rail-title"><h2>接下来会复习</h2><button class="text-button" id="plan-reminder">每天 ${state.settings.time} · 设置日历提醒 →</button></div>${next.length?next.map(c=>`<div class="review-item"><div><p data-study-content>${esc(c.zh)}</p><span>${esc(c.group)} · 上次 ${state.progress[c.id].lastScore} 分</span></div><button class="text-button" data-practice="${c.id}">${when(state.progress[c.id].due)} ↗</button></div>`).join(''):'<p>完成第一条练习并评分后，这里会出现你的复习计划。</p>'}</section>`;$('plan-review').addEventListener('click',()=>{showView('practice');scope='all';$('scope').value='all';setMode('due');});$('plan-reminder').addEventListener('click',openSettings);$('plan-view').querySelectorAll('[data-practice]').forEach(b=>b.addEventListener('click',()=>startSingle(b.dataset.practice)));}
function openSettings(){const languages=window.ParoleLanguages.set(state.settings);$('source-language').value=languages.sourceLanguage;$('target-language').value=languages.targetLanguage;refreshAISettings();$('goal-input').value=state.settings.goal;$('time-input').value=state.settings.time;$('notification-status').textContent=typeof Notification==='undefined'?'当前浏览器不支持网页通知，仍可使用日历提醒。':Notification.permission==='granted'?'网页通知已获授权；页面打开时可提醒。':Notification.permission==='denied'?'网页通知被禁用，可在 Chrome 网站设置中修改。':'';$('settings-dialog').showModal();}
function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function calendarDownload(){const url=window.PAROLE_SITE_URL||location.href.split('#')[0];download(C.calendar(state.settings.time,url,Date.now(),window.ParoleUI?.language()),'Parole-daily-practice.ics','text/calendar;charset=utf-8');$('notification-status').textContent=`已下载每日 ${state.settings.time} 的提醒文件。请导入常用日历并确认通知已开启。修改时间后，请先删除旧日程再重新导入。`;}
async function requestNotifications(){if(typeof Notification==='undefined'){toast('当前浏览器不支持网页通知，请使用日历提醒。');return;}try{const permission=await Notification.requestPermission();$('notification-status').textContent=permission==='granted'?'网页通知已开启。请保持页面打开；关闭后使用日历提醒。':'未开启网页通知，日历提醒仍可使用。';}catch{toast('无法请求通知权限，请使用日历提醒。');}}
function checkReminder(){if(!deck.length)return;const now=new Date(),time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,today=C.dayKey();if(time<state.settings.time||state.lastNotification===today||typeof Notification==='undefined'||Notification.permission!=='granted')return;const s=stats();if(s.today.size>=state.settings.goal&&!s.due.length)return;try{const n=new Notification('Parole · Language practice',{body:s.due.length?`有 ${s.due.length} 条表达到期了，花几分钟复习一下。`:`今天还需首次练习 ${Math.max(0,state.settings.goal-s.today.size)} 条新句。`,tag:'parole-daily'});n.onclick=()=>{window.focus();showView('practice');n.close();};state.lastNotification=today;persist();}catch{/* Calendar reminders remain available. */}}
function refreshLanguageLabels(){const l=window.ParoleLanguages.set(state.settings);$('answer').lang=l.targetLanguage;$('prompt').lang=l.sourceLanguage;}
function rebuildCatalog(){refreshLanguageLabels();
 deck=Sets.activeCards(state);ids=new Set(state.catalog.cards.map(c=>c.id));byId=Object.fromEntries(state.catalog.cards.map(c=>[c.id,c]));groupNames=[...new Set(deck.map(c=>c.group))];
 if(scope!=='all'&&!groupNames.includes(scope))scope='all';
 $('scope').innerHTML='<option value="all">全部新句类别</option>'+groupNames.map(g=>'<option data-study-content value="'+esc(g)+'">'+esc(g)+'</option>').join('');$('scope').value=scope;
}
function catalogChanged(){
 cancelAI();state.draft=null;rebuildCatalog();persist();chooseNext();if(view==='plan')renderPlan();
}
rebuildCatalog();
libraryUI=window.ParoleLibrary.create({container:$('library-view'),getState:()=>state,changed:catalogChanged,practice:startSingle,when});
$('scope').innerHTML='<option value="all">全部新句类别</option>'+groupNames.map(g=>`<option data-study-content value="${esc(g)}">${esc(g)}</option>`).join('');$('scope').addEventListener('change',()=>{scope=$('scope').value;state.draft=null;persist();chooseNext();});document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));$('answer-form').addEventListener('submit',e=>{e.preventDefault();revealAnswer();});$('answer').addEventListener('input',()=>{const text=$('answer').value.trim();$('word-count').textContent=(text?text.split(/\s+/).length:0)+' 词';$('reveal').disabled=!text;persistDraft();});$('answer').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();revealAnswer();}});$('dont-know').addEventListener('click',()=>revealAnswer(true));$('settings-open').addEventListener('click',openSettings);$('learning-open').addEventListener('click',()=>{openSettings();$('language-settings').scrollIntoView({block:'start'});});window.addEventListener('parole-ui-change',()=>{updateStats();historyRef=null;renderHistory();if(view==='plan')renderPlan();});$('goal-edit').addEventListener('click',openSettings);$('settings-close').addEventListener('click',()=>$('settings-dialog').close());$('settings-form').addEventListener('submit',e=>{e.preventDefault();const goal=Number($('goal-input').value),time=$('time-input').value;if(!Number.isInteger(goal)||goal<1||goal>100||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return;const languageChanged=window.ParoleLanguages.get().sourceLanguage!==$('source-language').value||window.ParoleLanguages.get().targetLanguage!==$('target-language').value;state.settings={goal,time,sourceLanguage:$('source-language').value,targetLanguage:$('target-language').value};persist();updateStats();if(view==='plan')renderPlan();if(!current&&view==='practice')chooseNext();if(languageChanged){cancelAI();voice?.reset();speaking?.reset();aiResult=null;aiError='';oralScore=null;refreshLanguageLabels();if(revealed)renderResult();}toast('学习设置已保存');});$('notifications').addEventListener('click',requestNotifications);$('calendar').addEventListener('click',calendarDownload);$('export').addEventListener('click',()=>{download(JSON.stringify(state,null,2),`Parole-backup-${C.dayKey()}.json`,'application/json');$('backup-status').textContent='已导出，包含全部句集、表达、评分、复习计划、草稿和笔记，不包含 API Key。';});$('import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('备份文件过大');const incoming=Sets.validate(JSON.parse(await file.text()),seed,C);if(!window.confirm(`导入后会替换当前进度。备份包含 ${Object.keys(incoming.progress).length} 条已学表达。继续吗？`))return;state=incoming;rebuildCatalog();storageBlocked=false;const ok=persist();if(ok)$('storage-warning').hidden=true;current=null;extra=false;manual=false;chooseNext();if(view==='library')renderLibrary();if(view==='plan')renderPlan();$('backup-status').textContent=ok?'备份已导入。':'已导入到当前页面，但浏览器未能持久保存，请保留备份。';}catch(err){$('backup-status').textContent='导入失败：'+err.message+'。当前进度没有改变。';}finally{e.target.value='';}});
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{const incoming=Sets.validate(JSON.parse(e.newValue),seed,C);cancelAI();state=incoming;rebuildCatalog();chooseNext();if(view==='plan')renderPlan();if(view==='library')libraryUI.refresh();}catch{/* Invalid writes do not replace usable data. */}});

updateStats();const pendingDue=C.dueCards(deck,state.progress);if(state.draft&&deck.some(c=>c.id===state.draft.id)&&(!pendingDue.length||pendingDue[0].id===state.draft.id)){manual=!!state.progress[state.draft.id]&&state.progress[state.draft.id].due>Date.now();showCard(byId[state.draft.id],state.draft);}else chooseNext();
cloud=window.ParoleSync.create({account:ACCOUNT,requireAccount:true,storage:{getItem:key=>localStorage.getItem(key+SUFFIX),setItem:(key,value)=>localStorage.setItem(key+SUFFIX,value),removeItem:key=>localStorage.removeItem(key+SUFFIX)},getState:()=>{if(storageBlocked)throw Error('本机存储不可用，请先导出备份。');return state;},validate:raw=>Sets.validate(raw,seed,C),applyState:raw=>{
 const incoming=Sets.validate(raw,seed,C);
 // Save a recovery copy before replacing local data. Failure aborts the pull.
 localStorage.setItem('parole.before-cloud.v1'+SUFFIX,JSON.stringify(state));
 localStorage.setItem(KEY,JSON.stringify(incoming));state=incoming;resetAI();current=null;rebuildCatalog();chooseNext();if(view==='library')libraryUI.refresh();if(view==='plan')renderPlan();
},onStatus:(message,connected)=>{$('sync-status').textContent=message;document.querySelector('.local-badge').textContent=message;$('sync-now').disabled=!connected;},onConflict:conflict=>{
 $('sync-conflict').hidden=!conflict;
 if(conflict)$('sync-conflict-summary').textContent=`本机 ${conflict.local.history.length} 次练习；云端 ${conflict.remote?.history.length||0} 次练习。选择一份作为当前记录，另一份先保存为备份。`;
}});
$('sync-title').parentElement.hidden=!ACCOUNT;
$('sync-now').onclick=()=>cloud.sync();
function resolveCloud(choice){const conflict=cloud.getConflict();if(!conflict)return;if(!confirm(choice==='push'?'以本机记录替换云端记录？会先下载被替换的云端备份。':'以云端记录替换本机记录？会先下载被替换的本机备份。'))return;
 const backup=choice==='push'?conflict.remote:state;if(backup)download(JSON.stringify(backup,null,2),'Parole-sync-backup-'+Date.now()+'.json','application/json');cloud.sync(choice);
}
$('sync-local').onclick=()=>resolveCloud('push');$('sync-remote').onclick=()=>resolveCloud('pull');
$('sync-recovery').onclick=()=>{const backup=localStorage.getItem('parole.before-cloud.v1'+SUFFIX);if(!backup){toast('还没有被云端替换的本机记录。');return;}download(backup,'Parole-before-cloud.json','application/json');};
window.addEventListener('online',()=>cloud.sync());
window.addEventListener('storage',e=>{if(e.key===window.ParoleSync.CONFIG){location.reload();}else if(e.key===KEY)cloud.changed();});
setInterval(()=>{if(!document.hidden)cloud.sync();},60000);
cloud.sync();
setInterval(()=>{updateStats();if(view==='practice'&&!current)chooseNext();if(view==='plan')renderPlan();checkReminder();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateStats();checkReminder();}});
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'get_language_practice_status',title:'查看语言学习进度',description:'读取今日完成量、到期复习数量和当前练习题目，不揭示答案或修改进度。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('不接受参数');const s=stats();return {newToday:s.today.size,reviewedToday:s.reviewed.size,dailyNewGoal:state.settings.goal,due:s.due.length,learned:s.learned,current:current?{id:current.id,prompt:current.zh}:null};}})).catch(()=>{});}catch{/* Optional browser API. */}}
})();
