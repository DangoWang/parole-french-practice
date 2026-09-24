(function(root){'use strict';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function attach({dialog,getState,setId,onAdded}){
 const G=root.ParoleGenerator,L=root.ParoleLanguages,single=dialog.querySelector('form'),head=single.querySelector('.dialog-head');
 const language=L.normalize(getState().settings);let controller=null,generation=0,rows=[],usedLanguage=language,added=false;
 dialog.classList.add('expression-dialog');single.before(head);
 const tabs=document.createElement('div');tabs.className='segmented add-mode';tabs.setAttribute('aria-label','添加方式');tabs.innerHTML='<button type="button" class="selected" data-add-mode="single" aria-pressed="true">单条添加</button><button type="button" data-add-mode="batch" aria-pressed="false">AI 批量生成</button>';head.after(tabs);
 const batch=document.createElement('section');batch.hidden=true;batch.className='batch-panel';dialog.append(batch);
 const lengthDefault=root.ParoleUI?.language()==='zh'?'一句话，约 10–20 个词':'One sentence, about 10–20 words';
 batch.innerHTML=`<form class="generation-form"><p class="generation-language" data-study-content>${esc(L.options[language.sourceLanguage])} → ${esc(L.options[language.targetLanguage])}</p><label>应用场景<textarea name="scenario" required maxlength="2000" rows="3" placeholder="例如：租房看房，向房东询问租金、设施、合同和周边交通"></textarea></label><div class="generation-grid"><label>单条期望长度<input name="length" required maxlength="160" value="${esc(lengthDefault)}"></label><label>生成数量<input name="count" type="number" min="1" max="50" step="1" value="20" required></label></div><label>目标风格<select name="style"><option value="spoken">自然口语</option><option value="spontaneous">边想边说</option><option value="written">日常书面语</option><option value="formal">正式书面语</option></select></label><p class="muted">GPT-5.4 mini · 使用学习设置中的 API Key，按 API 用量计费。一次最多 50 条，生成后预览确认再加入。</p><div class="generation-actions"><button class="primary" type="submit">生成表达</button><button class="text-button generation-cancel" type="button" hidden>取消生成</button><button class="text-button generation-settings" type="button">设置 API Key</button></div></form><p class="generation-status" role="status" aria-live="polite"></p><form class="generation-preview" hidden><div class="preview-heading"><h3>预览与修改</h3><label class="check-label"><input type="checkbox" class="preview-all" checked> 全选</label></div><p class="muted">可编辑题目、表达、类别和说明；取消勾选可排除。加入时会跳过当前句集中的重复表达。</p><p class="preview-count muted"></p><div class="preview-rows"></div><div class="preview-save"><button type="submit" class="primary">加入当前句集</button></div></form>`;
 const form=batch.querySelector('.generation-form'),preview=batch.querySelector('.generation-preview'),status=batch.querySelector('.generation-status'),cancel=batch.querySelector('.generation-cancel'),generate=form.querySelector('[type=submit]'),save=preview.querySelector('[type=submit]'),list=batch.querySelector('.preview-rows'),all=batch.querySelector('.preview-all');
 const settingsButton=batch.querySelector('.generation-settings');form.after(settingsButton);
 function refreshKey(){let hasKey=false;try{hasKey=!!root.ParoleAI.loadConfig(localStorage).key.trim();}catch{}settingsButton.hidden=hasKey;form.classList.toggle('missing-api-key',!hasKey);form.setAttribute('aria-disabled',String(!hasKey));generate.disabled=!hasKey||!!controller;form.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=!hasKey||!!controller);return hasKey;}
 function stop(){generation++;controller?.abort();controller=null;cancel.hidden=true;tabs.querySelector('[data-add-mode=single]').disabled=false;refreshKey();}
 function dirty(){return rows.length>0&&!added||!!controller;}
 function close(){if(dirty()&&!confirm('关闭后会丢弃尚未加入的生成内容。继续吗？'))return;dialog.close();}
 head.querySelector('.icon-button').onclick=close;
 const onCancel=e=>{e.preventDefault();close();};dialog.addEventListener('cancel',onCancel);
 const onStorage=e=>{if(e.key===root.ParoleAI.STORAGE_KEY||e.key===null)refreshKey();};root.addEventListener('storage',onStorage);
 dialog.addEventListener('close',()=>{stop();dialog.classList.remove('expression-dialog');dialog.removeEventListener('cancel',onCancel);root.removeEventListener('storage',onStorage);},{once:true});
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{const isBatch=b.dataset.addMode==='batch';single.hidden=isBatch;batch.hidden=!isBatch;if(isBatch)refreshKey();tabs.querySelectorAll('button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});});
 refreshKey();
 function updateCount(){const checked=[...list.querySelectorAll('[data-include]')].filter(x=>x.checked).length;batch.querySelector('.preview-count').textContent=`已选 ${checked} / ${rows.length}`;save.disabled=!checked;all.checked=checked===rows.length;all.indeterminate=checked>0&&checked<rows.length;}
 function renderRows(){const existing=new Set(getState().catalog.cards.filter(c=>c.setId===setId&&!c.deleted).map(G.signature));
 list.innerHTML=rows.map((c,i)=>{const duplicate=existing.has(G.signature(c));return `<article class="generated-row" data-row="${i}"><div class="generated-row-head"><label class="check-label"><input type="checkbox" data-include ${duplicate?'':'checked'}> #${i+1}</label>${duplicate?'<span class="muted">当前句集已有此表达</span>':''}</div><label>题目提示<textarea name="zh" lang="${usedLanguage.sourceLanguage}" dir="auto" maxlength="2000" rows="2">${esc(c.zh)}</textarea></label><label>参考表达<textarea name="fr" lang="${usedLanguage.targetLanguage}" dir="auto" maxlength="2000" rows="2">${esc(c.fr)}</textarea></label><div class="generation-grid"><label>类别<input name="group" maxlength="100" value="${esc(c.group)}"></label><label class="check-label"><input name="star" type="checkbox"> 优先掌握</label></div><label>补充说明<textarea name="note" dir="auto" maxlength="2000" rows="2">${esc(c.note)}</textarea></label></article>`;}).join('');preview.hidden=false;list.querySelectorAll('[data-include]').forEach(x=>x.onchange=updateCount);updateCount();}
 all.onchange=()=>{list.querySelectorAll('[data-include]').forEach(x=>x.checked=all.checked);updateCount();};
 cancel.onclick=()=>{stop();if(rows.length)preview.hidden=false;status.textContent='生成已取消，未添加任何表达。';};
 batch.querySelector('.generation-settings').onclick=()=>{if(dirty()&&!confirm('关闭后会丢弃尚未加入的生成内容。继续吗？'))return;dialog.close();document.getElementById('settings-open').click();document.getElementById('ai-settings-title').scrollIntoView({block:'start'});};
 form.onsubmit=async e=>{e.preventDefault();if(controller||!refreshKey())return;if(rows.length&&!confirm('重新生成会替换当前预览。继续吗？'))return;
 const f=new FormData(form);usedLanguage=L.normalize(getState().settings);const preferences={scenario:f.get('scenario'),length:f.get('length'),style:f.get('style'),count:Number(f.get('count')),...usedLanguage};
 let key;try{G.options(preferences);key=root.ParoleAI.loadConfig(localStorage).key;if(!key)throw Error('请先在学习设置中保存 OpenAI API Key。');}catch(err){status.textContent=err.message;return;}
 const id=++generation;controller=new AbortController();generate.disabled=true;cancel.hidden=false;form.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=true);tabs.querySelector('[data-add-mode=single]').disabled=true;preview.hidden=true;status.textContent='正在生成，请稍候…';batch.querySelector('.generation-language').textContent=L.options[usedLanguage.sourceLanguage]+' → '+L.options[usedLanguage.targetLanguage];
 try{const result=await G.generate({key,preferences,signal:controller.signal});if(id!==generation||!dialog.open)return;rows=result;renderRows();status.textContent='生成完成，请检查并选择要加入的表达。';}
 catch(err){if(id!==generation)return;status.textContent=err.name==='AbortError'?'生成已取消，未添加任何表达。':err.message;if(rows.length)preview.hidden=false;}
 finally{if(id===generation)stop();}
 };
 preview.onsubmit=e=>{e.preventDefault();if(added)return;try{
 const cards=[...list.querySelectorAll('[data-row]')].filter(row=>row.querySelector('[data-include]').checked).map(row=>Object.fromEntries(['zh','fr','group','note'].map(k=>[k,row.querySelector(`[name="${k}"]`).value]).concat([['star',row.querySelector('[name=star]').checked]])));
 const result=G.prepareAddition(getState().catalog,setId,cards);getState().catalog.cards.push(...result.cards);added=true;dialog.close();onAdded(result);
 }catch(err){status.textContent=err.message;status.scrollIntoView({block:'nearest'});}};
}
root.ParoleGeneratorUI={attach};
})(globalThis);
