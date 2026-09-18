(function(root){'use strict';
const validId=s=>typeof s==='string'&&!['__proto__','prototype','constructor'].includes(s)&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
function normalizeTags(tags=[]){if(!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||t.length>30))throw Error('标签最多 20 个，每个不超过 30 字');return [...new Set(tags.map(t=>t.trim()).filter(Boolean))];}
function catalog(seed){return {sets:[{id:'tcf-tache1',name:'TCF Tâche1',tags:[],description:'350 条 B1–B2 日常法语表达',active:true,deleted:false}],cards:seed.map(c=>({...c,setId:'tcf-tache1',deleted:false}))};}
function validateCatalog(raw){
 if(!raw||!Array.isArray(raw.sets)||!Array.isArray(raw.cards)||raw.sets.length>1000||raw.cards.length>20000)throw Error('句集数据格式不正确');
 const ids=new Set(),cardIds=new Set();
 const text=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
 const sets=raw.sets.map(s=>{if(!s||!validId(s.id)||ids.has(s.id)||!text(s.name,100,true)||!text(s.description,1000)||typeof s.active!=='boolean'||typeof s.deleted!=='boolean')throw Error('句集名称或编号无效');if(s.importedPacks!==undefined&&(!Array.isArray(s.importedPacks)||s.importedPacks.length>100||s.importedPacks.some(p=>!validId(p))))throw Error('句集资料标记无效');ids.add(s.id);return {...(s.importedPacks!==undefined?{importedPacks:[...new Set(s.importedPacks)]}:{}),id:s.id,name:s.name,tags:normalizeTags(s.tags),description:s.description,active:s.active,deleted:s.deleted};});
 const cards=raw.cards.map(c=>{if(!c||!validId(c.id)||cardIds.has(c.id)||!ids.has(c.setId)||!text(c.zh,2000,true)||!text(c.fr,2000,true)||!text(c.group,100,true)||!text(c.note,2000)||typeof c.star!=='boolean'||typeof c.deleted!=='boolean')throw Error('表达内容或所属句集无效');if(c.dimension!==undefined&&!text(c.dimension,100))throw Error('表达维度无效');cardIds.add(c.id);return {...(c.dimension!==undefined?{dimension:c.dimension}:{}),id:c.id,setId:c.setId,zh:c.zh,fr:c.fr,group:c.group,note:c.note,star:c.star,deleted:c.deleted};});
 return {sets,cards};
}
function initial(seed,core){return {...core.initialState(),version:2,catalog:catalog(seed)};}
function validate(raw,seed,core){
 if(!raw||![1,2].includes(raw.version))throw Error('不支持的备份版本');
 const data=raw.version===1?catalog(seed):validateCatalog(raw.catalog);
 const state=core.validateState({...raw,version:1},new Set(data.cards.map(c=>c.id)));
 return {...state,version:2,catalog:data};
}
function activeCards(state){const ids=new Set(state.catalog.sets.filter(s=>s.active&&!s.deleted).map(s=>s.id));return state.catalog.cards.filter(c=>!c.deleted&&ids.has(c.setId));}
function removeForever(state,cardIds){const ids=new Set(cardIds);state.catalog.cards=state.catalog.cards.filter(c=>!ids.has(c.id));for(const id of ids){delete state.progress[id];delete state.notes[id];}state.history=state.history.filter(h=>!ids.has(h.id));if(ids.has(state.draft?.id))state.draft=null;}
const api={normalizeTags,catalog,validateCatalog,initial,validate,activeCards,removeForever};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ParoleCollections=api;
})(typeof window!=='undefined'?window:globalThis);
