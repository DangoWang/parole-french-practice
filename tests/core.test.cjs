const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../dist/core.js');
const now=new Date(2026,8,10,15,0).getTime();
test('sentence notes survive backups; old backups load with empty notes',()=>{const state=C.initialState(),ids=new Set(['A01','A02']);state.notes={A01:'conseiller de + 动词\n注意介词',A02:'独立笔记'};assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(state)),ids).notes,state.notes);delete state.notes;assert.deepEqual(C.validateState(state,ids).notes,{});state.notes={A01:123};assert.throws(()=>C.validateState(state,ids));});
test('French attempts and reference snapshots survive reload and backup import',()=>{
 const state=C.initialState(),ids=new Set(['A01']);state.history=[{id:'A01',at:now,score:7,answer:'Je te conseille à réserver.',reference:'Je te conseille de réserver.'},{id:'A01',at:now+1,score:1,answer:'',reference:'Je te conseille de réserver.'},{id:'A01',at:now-1,score:6}];
 assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(state)),ids).history,state.history);
 state.history[0].answer={text:'invalid'};assert.throws(()=>C.validateState(state,ids));
});
test('input-side differences highlight typed mistakes rather than replacing the input',()=>{
 const answer='Je te conseille à réserver.',reference='Je te conseille de réserver.';
 const input=C.wordDiff(reference,answer);assert.equal(input.map(t=>t.word).join(' '),answer);assert.deepEqual(input.filter(t=>!t.match).map(t=>t.word),['à']);
 assert.deepEqual(C.wordDiff(answer,reference).filter(t=>!t.match).map(t=>t.word),['de']);
});
test('daily quota counts first-ever practice, not old reviews or same-day repeats',()=>{
 const history=[{id:'old',at:C.dayAfter(-2,now)},{id:'old',at:now},{id:'new',at:now+1},{id:'new',at:now+2},{id:'other',at:now+3}];
 const counts=C.dailyCounts(history,now);assert.deepEqual([...counts.newIds],['new','other']);assert.deepEqual([...counts.reviewIds],['old','new']);
 assert.equal(C.dailyCounts([...history].reverse(),now).newIds.size,2);
 assert.equal(C.dailyCounts(history,C.dayAfter(1,now)).newIds.size,0);
});
test('mandatory reviews bypass new quota and category filter',()=>{
 const cards=[{id:'old',group:'酒店'},{id:'new',group:'学校'}],state=C.initialState();state.settings.goal=1;
 state.history=[{id:'learned',at:now}];state.progress.old={due:now-1};
 assert.equal(C.nextPracticeCard(cards,state,{scope:'学校'},now).id,'old');
 assert.equal(C.nextPracticeCard(cards,state,{scope:'学校',mode:'due'},now).id,'old');
 state.progress.old.due=now+1;assert.equal(C.nextPracticeCard(cards,state,{scope:'学校'},now),null);
});
test('reviewing many old cards leaves the whole new-card allowance available',()=>{
 const state=C.initialState();state.settings.goal=1;state.history=[{id:'old',at:C.dayAfter(-1,now)},{id:'old',at:now}];state.progress.old={due:C.dayAfter(1,now)};
 const cards=[{id:'old',group:'酒店'},{id:'new',group:'学校'}];assert.equal(C.nextPracticeCard(cards,state,{},now).id,'new');
 state.history.push({id:'new',at:now});state.progress.new={due:now+600000};assert.equal(C.nextPracticeCard(cards,state,{},now),null);
 assert.equal(C.nextPracticeCard(cards,state,{},now+600000).id,'new');
});
test('extra new learning still cannot jump ahead of overdue review',()=>{
 const state=C.initialState();state.progress.old={due:now-1};const cards=[{id:'new',group:'学校',star:true},{id:'old',group:'酒店'}];
 assert.equal(C.nextPracticeCard(cards,state,{extra:true,scope:'学校'},now).id,'old');
});
test('source deck has 350 unique complete bilingual prompts',()=>{const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/deck.js'),'utf8'),ctx);const deck=ctx.window.PAROLE_DECK;assert.equal(deck.length,350);assert.equal(new Set(deck.map(c=>c.id)).size,350);for(const c of deck){assert.ok(c.fr&&c.zh&&c.group);assert.match(c.zh,/[\u4e00-\u9fff]/);}assert.equal(new Set(deck.map(c=>c.group)).size,16);});
test('failure scores reset successful streak and return in ten minutes',()=>{const old=C.schedule(null,10,now);const fail=C.schedule(old,2,now);assert.equal(fail.due,now+600000);assert.equal(fail.successes,0);assert.equal(fail.stage,'learning');assert.equal(fail.lapses,1);assert.equal(fail.reviews,2);});
test('all 1–10 scores produce valid, monotonic first intervals',()=>{let prior=0;for(let s=1;s<=10;s++){const p=C.schedule(null,s,now);assert.ok(p.due>=prior);assert.ok(p.due>now);prior=p.due;}assert.equal(C.schedule(null,5,now).due,C.dayAfter(1,now));assert.equal(C.schedule(null,10,now).due,C.dayAfter(4,now));assert.throws(()=>C.schedule(null,0,now));assert.throws(()=>C.schedule(null,10.5,now));});
test('success extends spacing, capped at 365 days; relapse returns tomorrow',()=>{let p=C.schedule(null,10,now);for(let i=0;i<20;i++)p=C.schedule(p,10,p.due);assert.equal(p.interval,365);const lapse=C.schedule(p,4,p.due);assert.equal(lapse.interval,1);assert.equal(lapse.successes,0);assert.ok(lapse.ease>=1.3);});
test('calendar-day arithmetic preserves local dates across month boundaries',()=>{const t=new Date(2026,0,31,23,59).getTime();assert.equal(C.dayKey(C.dayAfter(1,t)),'2026-02-01');assert.equal(new Date(C.dayAfter(1,t)).getHours(),0);});
test('punctuation/case/apostrophe accepted, accents distinguishable',()=>{assert.equal(C.match('JE T’ÉCRIS POUR T’INVITER !',"Je t'écris pour t'inviter.").score,10);assert.equal(C.match('Je te conseille de reserver.','Je te conseille de réserver.').score,9);assert.equal(C.match('','Bonjour.').score,1);assert.ok(C.match('zzzzz','Je te recommande cet hôtel.').score<4);});
test('word difference locates missing word',()=>{const diff=C.wordDiff('Je conseille cet hôtel.','Je te conseille cet hôtel.');assert.deepEqual(diff.filter(w=>!w.match).map(w=>w.word),['te']);});
test('daily progress counts unique cards, due queue excludes future',()=>{const h=[{id:'A01',at:now},{id:'A01',at:now+1},{id:'A02',at:now},{id:'A03',at:C.dayAfter(-1,now)}];assert.equal(C.todayIds(h,now).size,2);const cards=[{id:'A01'},{id:'A02'},{id:'A03'}];assert.deepEqual(C.dueCards(cards,{A01:{due:now-1},A02:{due:now+100},A03:{due:now-100}},now).map(c=>c.id),['A03','A01']);});
test('backup roundtrip preserves scores and rejects malformed data',()=>{const state=C.initialState();state.progress.A01=C.schedule(null,8,now);state.history=[{id:'A01',score:8,at:now}];state.draft={id:'A02',answer:'Bonjour',revealed:false,score:null};const ids=new Set(['A01','A02']);assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(state)),ids),state);const bad=structuredClone(state);bad.progress.A01.lastScore=99;assert.throws(()=>C.validateState(bad,ids));const other=structuredClone(state);other.history[0].id='unknown';assert.throws(()=>C.validateState(other,ids));});
test('ICS reminder is daily, local-time and UTF-8 folded, with live link',()=>{const url='https://parole-tcf-practice.crafty-ghost-3472.chatgpt.site';const text=C.calendar('20:00',url,now),unfold=text.replace(/\r\n /g,'');assert.match(unfold,/DTSTART:20260910T200000/);assert.match(unfold,/RRULE:FREQ=DAILY/);assert.match(unfold,/BEGIN:VALARM/);assert.ok(unfold.includes(url));for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);const tomorrow=C.calendar('12:00',url,now).replace(/\r\n /g,'');assert.match(tomorrow,/DTSTART:20260911T120000/);});
test('HTML entrypoints exist and all application files parse',()=>{const dir=path.join(__dirname,'../dist'),html=fs.readFileSync(path.join(dir,'index.html'),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(!m[1].startsWith('http'))assert.ok(fs.existsSync(path.join(dir,m[1].split('?')[0])),m[1]);}for(const file of ['app.js','core.js','deck.js'])new vm.Script(fs.readFileSync(path.join(dir,file),'utf8'));});

