const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../dist/languages.js'),AI=require('../dist/ai.js'),S=require('../dist/speaking.js'),V=require('../dist/voice.js'),C=require('../dist/core.js'),Sets=require('../dist/collections.js'),UI=require('../dist/ui.js'),{cleanState}=require('../server/sync-handler.js');
test('learning language settings survive backup validation and cloud sanitization; old data stays compatible',()=>{
 const state=Sets.initial([],C);state.settings.sourceLanguage='en';state.settings.targetLanguage='ja';
 assert.deepEqual(Sets.validate(state,[],C).settings,state.settings);
 assert.deepEqual(cleanState(state).settings,state.settings);
 assert.deepEqual(L.normalize(),{sourceLanguage:'zh',targetLanguage:'fr'});
 assert.throws(()=>Sets.validate({...state,settings:{...state.settings,targetLanguage:'invalid'}},[],C));
});
test('text and audio requests use chosen support/target languages without changing study content',()=>{
 const card={zh:'Ask about prices',fr:'reference',group:'travel'},l={sourceLanguage:'en',targetLanguage:'es'};
 const text=AI.requestBody(card,'¿Cuánto cuesta?',l),audio=S.requestBody('audio',card,l);
 assert.match(text.instructions,/Spanish language tutor/);assert.match(text.instructions,/explanations and error reasons in English/);
 assert.match(audio.messages[0].content,/practising Spanish, using English/);
 assert.equal(JSON.parse(text.input).meaning,card.zh);assert.equal(JSON.parse(text.input).answer,'¿Cuánto cuesta?');
 assert.match(audio.messages[0].content,/wrong: score<=4/);
});
test('transcription sends the selected ISO language and leaves recognised speech intact',async()=>{
 let sent;const text=await V.transcribe({key:'fixture',blob:new Blob(['audio'],{type:'audio/webm'}),language:'ja',fetchImpl:async(_,o)=>{sent=o.body;return {ok:true,json:async()=>({text:'こんにちは'})};}});
 assert.equal(sent.get('language'),'ja');assert.equal(text,'こんにちは');
});
test('English UI translates whole labels before numeric fragments; Chinese stays unchanged',()=>{
 assert.equal(UI.translate('最近 7 天'),'LAST 7 DAYS');
 assert.equal(UI.translate('未来 7 天'),'Next 7 days');
 assert.equal(UI.translate('未连接云端 · 记录保存在本机'),'Not signed in · saved on this device');
 assert.equal(UI.translate('今日新学','zh'),'今日新学');
 assert.equal(UI.translate('还需首次练习 20 条新句。 今日已复习 5 条，不占新学名额。'),'20 new expressions left. Reviewed 5 today, separate from the new goal.');
});
