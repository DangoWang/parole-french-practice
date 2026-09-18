const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');let group='',index=0;const cards=[],groups={};
for(const line of fs.readFileSync(path.join(base,'content/oral-tache2.tsv'),'utf8').split(/\r?\n/).filter(Boolean)){
 if(line.startsWith('@')){group=line.slice(1);groups[group]=0;continue;}
 const fields=line.split('|');if(fields.length!==5||!group)throw Error('Invalid content row: '+line);
 const [stage,topic,register,zh,fr]=fields;if(!['开场','常用提问','回应','收尾'].includes(stage)||!['tu','vous'].includes(register))throw Error('Invalid metadata');
 const n=++groups[group];cards.push({id:'oral2-'+String(++index).padStart(3,'0'),zh,fr,group,note:`【${stage}】${topic} · ${register==='tu'?'tu：朋友或熟人':'vous：工作人员或不熟悉的人'} · B1–B2`,star:n<=2||(n>=5&&n<=14)||(n>=37&&n<=38)||n===43,deleted:false});
}
if(Object.keys(groups).length!==9||Object.values(groups).some(n=>n!==45))throw Error(JSON.stringify(groups));
if(new Set(cards.map(c=>c.fr)).size!==cards.length)throw Error('Duplicate French expressions');
const pack={id:'tcf-oral-tache2-20260917',name:'TCF Oral Tâche 2',description:'405 条 B1–B2 口语互动表达：9 类场景，每类 45 条，含开场、常用提问、回应与收尾。',cards};
fs.writeFileSync(path.join(base,'dist/oral-tache2.js'),'window.PAROLE_ORAL2_PACK='+JSON.stringify(pack,null,2)+';\n');
fs.writeFileSync(path.join(base,'dist/TCF-Oral-Tache-2.json'),JSON.stringify(pack,null,2)+'\n');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
fs.writeFileSync(path.join(base,'dist/TCF-Oral-Tache-2.csv'),'\uFEFF'+[['编号','类别','中文','法语','补充说明','优先掌握'],...cards.map(c=>[c.id,c.group,c.zh,c.fr,c.note,c.star?'是':'否'])].map(r=>r.map(quote).join(',')).join('\r\n'));
console.log(JSON.stringify({total:cards.length,groups,stages:cards.reduce((a,c)=>{const s=c.note.match(/【(.+?)】/)[1];a[s]=(a[s]||0)+1;return a;},{})},null,2));
