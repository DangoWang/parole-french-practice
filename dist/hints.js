(function(root){'use strict';
const eye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const closed='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8s3 5 9 5 9-5 9-5M4 10l-2 3m6-1-1 4m5-3v4m4-5 1 4m3-6 2 3"/></svg>';
function mount(doc){
 const parts=[['history','本句练习历史'],['notes','本句笔记']].map(([id,label])=>({button:doc.getElementById(id+'-visibility'),body:doc.getElementById(id+'-content'),label,visible:false}));
 function display(part,visible){part.visible=visible;part.body.classList.toggle('concealed',!visible);part.body.inert=!visible;part.body.setAttribute('aria-hidden',String(!visible));part.button.setAttribute('aria-pressed',String(visible));part.button.setAttribute('aria-label',(visible?'隐藏':'显示')+part.label);part.button.title=(visible?'隐藏':'显示')+part.label;part.button.innerHTML=visible?eye:closed;}
 for(const part of parts){part.button.onclick=()=>display(part,!part.visible);display(part,false);}
 return {reset(visible=false,enabled=true){for(const part of parts){part.button.disabled=!enabled;display(part,visible);}}};
}
const api={mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ParoleHints=api;
})(typeof window!=='undefined'?window:globalThis);
