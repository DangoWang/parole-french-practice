const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../dist/collections.js'),C=require('../dist/core.js');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/deck.js'),'utf8'),ctx);const seed=JSON.parse(JSON.stringify(ctx.window.PAROLE_DECK));
const now=Date.now();
test('set tags survive backups; older sets default to no tags',()=>{
 const state=S.initial(seed,C);state.catalog.sets[0].tags=[' 口语 ','旅行','口语'];
 const restored=S.validate(JSON.parse(JSON.stringify(state)),seed,C);assert.deepEqual(restored.catalog.sets[0].tags,['口语','旅行']);
 delete state.catalog.sets[0].tags;assert.deepEqual(S.validate(state,seed,C).catalog.sets[0].tags,[]);
 state.catalog.sets[0].tags=[{}];assert.throws(()=>S.validate(state,seed,C));
});
test('350 original expressions migrate with stable IDs and all learning records intact',()=>{
 const old=C.initialState();old.progress.A01=C.schedule(null,6,now);old.history=[{id:'A01',at:now,score:6,answer:'Bonjour',reference:'Salut'}];old.notes.A01='note';old.draft={id:'A02',answer:'Je',revealed:false,score:null};
 const migrated=S.validate(old,seed,C);assert.equal(migrated.catalog.sets[0].name,'TCF Tâche1');assert.equal(migrated.catalog.cards.length,350);assert.deepEqual(migrated.progress,old.progress);assert.deepEqual(migrated.history,old.history);assert.deepEqual(migrated.notes,old.notes);assert.deepEqual(migrated.draft,old.draft);assert.deepEqual(S.validate(JSON.parse(JSON.stringify(migrated)),seed,C),migrated);
});
function fixture(){const state=S.initial(seed,C);state.catalog.sets.push({id:'work',name:'工作',description:'',active:true,deleted:false});state.catalog.cards.push({id:'custom',setId:'work',zh:'你好',fr:'Bonjour',group:'问候',note:'',star:false,deleted:false});return state;}
test('multiple active sets share daily new quota; paused reviews never enter queue',()=>{
 const state=fixture();state.settings.goal=1;state.history.push({id:'A01',at:now,score:8});state.progress.A01=C.schedule(null,8,now);state.progress.custom={...C.schedule(null,1,now),due:now-1};
 assert.equal(C.nextPracticeCard(S.activeCards(state),state,{},now).id,'custom');
 state.catalog.sets.find(s=>s.id==='work').active=false;assert.equal(C.nextPracticeCard(S.activeCards(state),state,{},now),null);
 const due=state.progress.custom.due;state.catalog.sets.find(s=>s.id==='work').active=true;assert.equal(C.nextPracticeCard(S.activeCards(state),state,{},now).id,'custom');assert.equal(state.progress.custom.due,due);
});
test('no active sets produces no new or due cards; archive and restore retain history',()=>{
 const state=fixture();state.progress.custom=C.schedule(null,1,now);state.catalog.sets.forEach(s=>s.active=false);assert.equal(S.activeCards(state).length,0);
 const set=state.catalog.sets[1];set.active=true;set.deleted=true;assert.equal(S.activeCards(state).length,0);set.deleted=false;assert.equal(S.activeCards(state)[0].id,'custom');
 state.catalog.cards.find(c=>c.id==='custom').deleted=true;assert.equal(S.activeCards(state).length,0);assert.ok(state.progress.custom);
});
test('editing and moving expressions preserve reference snapshots and notes across backups',()=>{
 const state=fixture();state.history.push({id:'A01',at:now,score:9,answer:'old answer',reference:'old reference'});state.notes.A01='keep';const card=state.catalog.cards[0];card.fr='new reference';card.setId='work';card.group='new category';
 const imported=S.validate(JSON.parse(JSON.stringify(state)),seed,C);assert.equal(imported.history[0].reference,'old reference');assert.equal(imported.notes.A01,'keep');assert.equal(imported.catalog.cards[0].setId,'work');
});
test('invalid catalogs reject duplicates, missing owners, dangerous IDs and oversize content',()=>{
 for(const change of [s=>s.catalog.cards.push({...s.catalog.cards[0]}),s=>s.catalog.cards[0].setId='absent',s=>s.catalog.sets[0].id='<script>',s=>s.catalog.cards[0].fr='a'.repeat(2001)]){const state=fixture();change(state);assert.throws(()=>S.validate(state,seed,C));}
});
test('permanent deletion removes only selected expression records',()=>{
 const state=fixture();state.progress.A01=C.schedule(null,8,now);state.progress.custom=C.schedule(null,8,now);state.notes.custom='x';state.history=[{id:'custom',at:now,score:8},{id:'A01',at:now,score:8}];state.draft={id:'custom',answer:'hi'};S.removeForever(state,['custom']);assert.ok(state.progress.A01);assert.equal(state.progress.custom,undefined);assert.equal(state.notes.custom,undefined);assert.equal(state.history.length,1);assert.equal(state.draft,null);assert.ok(!state.catalog.cards.some(c=>c.id==='custom'));S.validate(state,seed,C);
});
test('library and collection scripts parse and v2 backups exclude extra API key fields',()=>{for(const file of ['library.js','collections.js','app.js'])new vm.Script(fs.readFileSync(require.resolve('../dist/'+file),'utf8'));const state=fixture();state.apiKey='test-secret';const restored=S.validate(state,seed,C);assert.ok(!JSON.stringify(restored).includes('test-secret'));});
