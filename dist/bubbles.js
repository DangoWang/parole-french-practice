(function(root){'use strict';
const MINUTE=60000,CADENCE=5*MINUTE,MAX=7*24*60;
function validate(raw){
 if(!Array.isArray(raw)||raw.length>2000)throw Error('Invalid bubble collection');
 const ids=new Set();return raw.map(x=>{
  if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(x.id)||ids.has(x.id)||typeof x.text!=='string'||!x.text.trim()||x.text.length>2000||typeof x.meaning!=='string'||x.meaning.length>2000||typeof x.paused!=='boolean'||typeof x.deleted!=='boolean')throw Error('Invalid bubble content');
  ids.add(x.id);const item={id:x.id,text:x.text,meaning:x.meaning,paused:x.paused,deleted:x.deleted};
  for(const k of ['created','due','lastReview','lastShown','interval','reviews']){if(!Number.isSafeInteger(x[k])||x[k]<0)throw Error('Invalid bubble schedule');item[k]=x[k];}
  if(item.interval>MAX||item.reviews>1000000)throw Error('Invalid bubble schedule');return item;
 });
}
function schedule(item,rating,now=Date.now()){
 const previous=item.interval||0;
 const interval={again:5,hard:10,good:Math.min(MAX,Math.max(30,previous*2)),easy:Math.min(MAX,Math.max(1440,previous*4))}[rating];
 if(!interval)throw Error('Invalid bubble rating');
 return {...item,interval,due:now+interval*MINUTE,lastReview:now,reviews:item.reviews+1};
}
function next(items,now=Date.now()){
 return items.filter(x=>!x.deleted&&!x.paused&&x.due<=now&&(!x.lastShown||x.lastShown+CADENCE<=now)).sort((a,b)=>a.due-b.due||a.lastShown-b.lastShown||a.created-b.created||a.id.localeCompare(b.id))[0]||null;
}
function create(text,meaning='',now=Date.now(),id=root.crypto.randomUUID()){
 return validate([{id,text:text.trim(),meaning:meaning.trim(),paused:false,deleted:false,created:now,due:now,lastReview:0,lastShown:0,interval:0,reviews:0}])[0];
}
const api={MINUTE,CADENCE,validate,schedule,next,create};if(typeof module!=='undefined')module.exports=api;else root.ParoleBubbles=api;
})(globalThis);
