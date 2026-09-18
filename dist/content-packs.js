(function(root){'use strict';
const nameKey=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function install(state,pack,setId){
 const target=state.catalog.sets.find(s=>s.id===setId&&!s.deleted);if(!target)return {added:0,reason:'missing'};
 if(target.importedPacks?.includes(pack.id))return {added:0,reason:'installed'};
 const existing=new Set(state.catalog.cards.filter(c=>c.setId===setId).map(c=>c.fr.normalize('NFC').trim().toLowerCase()));
 const ids=new Set(state.catalog.cards.map(c=>c.id)),add=[];
 for(const card of pack.cards){const key=card.fr.normalize('NFC').trim().toLowerCase();if(existing.has(key))continue;let id=card.id,n=1;while(ids.has(id))id=card.id+'-'+n++;ids.add(id);existing.add(key);add.push({...card,id,setId});}
 if(state.catalog.cards.length+add.length>20000)throw Error('表达总数超过 20000 条，未添加资料。');
 state.catalog.cards.push(...add);target.importedPacks=[...(target.importedPacks||[]),pack.id];
 return {added:add.length,reason:'added'};
}
function autoInstall(state,pack){const matches=state.catalog.sets.filter(s=>!s.deleted&&['tcforaltache2','tcforaletache2'].includes(nameKey(s.name)));return matches.length===1?install(state,pack,matches[0].id):{added:0,reason:'no-unique-match'};}
const api={install,autoInstall};if(typeof module!=='undefined')module.exports=api;else root.ParolePacks=api;
})(globalThis);
