const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');
function context(voice){let audio=0,text=0;const nodes={answer:{value:'Bonjour'},'answer-form':{querySelector:()=>({})},result:{}};const c={current:{fr:'Bonjour'},revealed:false,inputWasVoice:voice,oralScore:null,chosen:null,voice:{reset(){}},hints:{reset(){}},C:{match:()=>({score:10})},$:id=>nodes[id],renderResult(){},persistDraft(){},aiConfig:{enabled:true,key:'test'},speaking:{evaluate(){audio++}},runAI(){text++}};vm.createContext(c);vm.runInContext(source.match(/function revealAnswer\(skip=false\)\{[^\n]+/)[0],c);return {c,counts:()=>({audio,text})};}
test('confirm routes a recording only to audio grading, typed answers only to text grading',()=>{for(const voice of [true,false]){const {c,counts}=context(voice);c.revealAnswer();assert.deepEqual(counts(),voice?{audio:1,text:0}:{audio:0,text:1});if(voice)assert.equal(c.chosen,null);c.revealAnswer();assert.deepEqual(counts(),voice?{audio:1,text:0}:{audio:0,text:1});}});
test('skip never grades audio; an existing oral score is reused without another call',()=>{const a=context(true);a.c.revealAnswer(true);assert.deepEqual(a.counts(),{audio:0,text:0});assert.equal(a.c.chosen,1);const b=context(true);b.c.oralScore=8;b.c.revealAnswer();assert.equal(b.c.chosen,8);assert.deepEqual(b.counts(),{audio:0,text:0});});
test('restored voice draft retains its scoring route without persisting audio',()=>{const C=require('../dist/core.js');const s=C.initialState();s.draft={id:'a',answer:'Bonjour',revealed:true,score:8,inputMode:'voice'};assert.deepEqual(C.validateState(s,new Set(['a'])).draft,s.draft);});

test('late audio feedback fills an untouched score but preserves a manual rating',()=>{
 const callback=source.match(/onScore:score=>\{oralScore=score;.*?\}\}\}\);/)[0].replace(/^onScore:/,'').replace(/\}\);$/,'');
 for(const touched of [false,true]){const c={oralScore:null,revealed:true,inputWasVoice:true,scoreTouched:touched,chosen:touched?3:null,renderResult(){},persistDraft(){}};vm.createContext(c);vm.runInContext('('+callback+')(8)',c);assert.equal(c.chosen,touched?3:8);assert.equal(c.oralScore,8);}
});

test('switching sentences preserves the mounted speaking panel before clearing results',()=>{
 const panel={parent:'result',hidden:false},nodes={};
 const node=id=>nodes[id]||(nodes[id]={value:'',querySelector:()=>({}),focus(){}});
 node('exercise').append=p=>{assert.ok(p);p.parent='exercise';};
 Object.defineProperty(node('result'),'innerHTML',{set(){if(panel.parent==='result')panel.parent=null;}});
 const c={speakingPanel:panel,$:node,inputWasVoice:true,oralScore:8,speaking:{reset(){panel.hidden=true;}},voice:{reset(){}},cancelAI(){},aiResult:{},aiError:'',scoreTouched:true,current:null,renderHistory(){},renderNotes(){},hints:{reset(){}},chosen:null,manual:false,state:{progress:{},catalog:{sets:[]}},revealed:true,view:'practice',setTimeout(){},renderResult(){}};
 vm.createContext(c);
 for(const name of ['resetAI','showCard'])vm.runInContext(source.match(new RegExp('function '+name+'\\([^\\n]+'))[0],c);
 for(let i=0;i<3;i++){panel.parent='result';panel.hidden=false;c.showCard({id:String(i),zh:'题目',group:'日常'});assert.equal(panel.parent,'exercise');assert.equal(panel.hidden,true);assert.equal(c.oralScore,null);assert.equal(c.scoreTouched,false);}
});
