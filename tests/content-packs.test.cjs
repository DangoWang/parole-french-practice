const test=require('node:test'),assert=require('node:assert/strict');
const Packs=require('../dist/content-packs.js'),Sets=require('../dist/collections.js'),Core=require('../dist/core.js');
const pack=require('../dist/TCF-Oral-Tache-2.json');
function state(){const s=Sets.initial([],Core);s.catalog.sets.push({id:'user-oral',name:'TCF Oral Tâche 2',description:'my notes',tags:['口语'],active:false,deleted:false});return s;}
test('requested pack contains 405 distinct complete expressions with nine balanced scenarios',()=>{
 assert.equal(pack.cards.length,405);assert.equal(new Set(pack.cards.map(c=>c.id)).size,405);assert.equal(new Set(pack.cards.map(c=>c.fr)).size,405);
 const groups={};for(const c of pack.cards){assert.ok(c.zh&&c.fr&&c.note);assert.match(c.note,/【(开场|常用提问|回应|收尾)】/);groups[c.group]=(groups[c.group]||0)+1;}
 assert.equal(Object.keys(groups).length,9);assert.ok(Object.values(groups).every(n=>n===45));
});
test('auto append preserves custom content, paused status, notes and review records through backup',()=>{
 const s=state();s.catalog.cards.push({...pack.cards[0],id:'custom',setId:'user-oral',note:'personal note'});s.notes.custom='keep';s.progress.custom=Core.schedule(null,8);s.history=[{id:'custom',at:Date.now(),score:8,answer:'my attempt',reference:pack.cards[0].fr}];
 const before=JSON.parse(JSON.stringify(s));assert.equal(Packs.autoInstall(s,pack).added,404);assert.equal(s.catalog.cards[0].note,'personal note');assert.deepEqual(s.progress,before.progress);assert.deepEqual(s.history,before.history);assert.deepEqual(s.notes,before.notes);assert.equal(s.catalog.sets[1].active,false);assert.deepEqual(s.catalog.sets[1].tags,['口语']);
 const restored=Sets.validate(JSON.parse(JSON.stringify(s)),[],Core);assert.equal(Packs.autoInstall(restored,pack).reason,'installed');assert.deepEqual(restored,s);
 Sets.removeForever(restored,['oral2-002']);assert.equal(Packs.autoInstall(restored,pack).added,0);assert.ok(!restored.catalog.cards.some(c=>c.id==='oral2-002'));
});
test('no guessed destination; duplicate names and archived sets never auto-import',()=>{
 const s=state();s.catalog.sets[1].name='another';assert.equal(Packs.autoInstall(s,pack).reason,'no-unique-match');assert.equal(s.catalog.cards.length,0);
 s.catalog.sets[1].name='TCF ORAL TACHE2';s.catalog.sets[1].deleted=true;assert.equal(Packs.autoInstall(s,pack).added,0);
 s.catalog.sets[1].deleted=false;s.catalog.sets.push({...s.catalog.sets[1],id:'second'});assert.equal(Packs.autoInstall(s,pack).reason,'no-unique-match');
 assert.equal(Packs.install(s,pack,'second').added,405);assert.ok(s.catalog.cards.every(c=>c.setId==='second'));
});
test('ID collisions never overwrite expressions in a different collection',()=>{
 const s=state();s.catalog.cards.push({...pack.cards[0],setId:'tcf-tache1'});assert.equal(Packs.autoInstall(s,pack).added,405);assert.equal(s.catalog.cards[0].setId,'tcf-tache1');assert.equal(new Set(s.catalog.cards.map(c=>c.id)).size,406);assert.doesNotThrow(()=>Sets.validate(s,[],Core));
});
