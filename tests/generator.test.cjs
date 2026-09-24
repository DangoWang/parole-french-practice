const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../dist/generator.js'),C=require('../dist/core.js'),S=require('../dist/collections.js');
const preferences={scenario:'Ask a landlord about rent and transport',length:'one sentence, 10–20 words',style:'spontaneous',count:2,sourceLanguage:'en',targetLanguage:'fr'};
const expressions=[{prompt:'How much is the rent?',expression:'Et du coup, le loyer, c’est combien ?',category:'Housing',note:'Question; informal but polite.'},{prompt:'Are utilities included?',expression:'Est-ce que les charges sont comprises ?',category:'Housing',note:'Question about additional costs.'}];
const response=(items=expressions)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({expressions:items})}]}]});
test('generator uses chosen language pair, spontaneous style, bounded quantity and strict output',async()=>{
 let sent;const cards=await G.generate({key:'fixture-secret',preferences,fetchImpl:async(url,o)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=o;return {ok:true,json:async()=>response()};}});
 const body=JSON.parse(sent.body);assert.equal(body.model,'gpt-5.4-mini');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.properties.expressions.maxItems,2);
 assert.match(body.instructions,/expressions in French/);assert.match(body.instructions,/explanations in English/);assert.match(body.instructions,/thinking-aloud/);
 assert.deepEqual(JSON.parse(body.input),{scenario:preferences.scenario,approximateLength:preferences.length});assert.ok(!sent.body.includes('fixture-secret'));assert.equal(sent.headers.Authorization,'Bearer fixture-secret');assert.equal(sent.credentials,'omit');assert.equal(sent.redirect,'error');
 assert.equal(cards.length,2);assert.equal(cards[0].fr,expressions[0].expression);assert.equal(cards[0].star,false);
});
test('invalid preferences and missing key never make a request',async()=>{
 let calls=0;for(const p of [{...preferences,count:51},{...preferences,count:0},{...preferences,count:1.5},{...preferences,scenario:' '},{...preferences,style:'unknown'}])await assert.rejects(G.generate({key:'x',preferences:p,fetchImpl:()=>calls++}));
 await assert.rejects(G.generate({key:'',preferences,fetchImpl:()=>calls++}));assert.equal(calls,0);
});
test('partial, refused, wrong-count and oversized results cannot be added',()=>{
 assert.throws(()=>G.parseResponse({...response(),status:'incomplete'},2));
 assert.throws(()=>G.parseResponse({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]},2));
 assert.throws(()=>G.parseResponse(response(expressions.slice(0,1)),2));
 assert.throws(()=>G.parseResponse(response([{...expressions[0],expression:'x'.repeat(2001)},expressions[1]]),2));
});
test('API errors never expose raw response bodies or credentials; cancellation and timeout abort',async()=>{
 for(const status of [401,403,404,429,500])await assert.rejects(G.generate({key:'fixture-secret',preferences,fetchImpl:async()=>({ok:false,status,json:async()=>({error:{message:'fixture-secret'}})})}),e=>!e.message.includes('fixture-secret'));
 const fetchImpl=(_,o)=>new Promise((resolve,reject)=>{if(o.signal.aborted)reject(new Error('abort'));else o.signal.addEventListener('abort',()=>reject(new Error('abort')));});
 const c=new AbortController(),pending=G.generate({key:'x',preferences,signal:c.signal,fetchImpl});c.abort();await assert.rejects(pending,{name:'AbortError'});
 await assert.rejects(G.generate({key:'x',preferences,fetchImpl,timeoutMs:5}),/超时/);
});
test('batch insertion is additive, deduplicates within destination, and preserves history',()=>{
 const state=S.initial([{id:'A1',zh:'old',fr:expressions[0].expression,group:'Old',note:'',star:true}],C);
 state.history.push({id:'A1',score:8,at:Date.now(),answer:'old attempt'});state.notes.A1='Keep me';const before=JSON.stringify(state);
 const cards=G.parseResponse(response(),2);let n=0;const result=G.prepareAddition(state.catalog,'tcf-tache1',[...cards,cards[1]],()=>String(++n));
 assert.equal(result.cards.length,1);assert.equal(result.skipped,2);assert.equal(JSON.stringify(state),before);
 state.catalog.cards.push(...result.cards);const valid=S.validate(state,[],C);assert.equal(valid.catalog.cards.length,2);assert.equal(valid.history.length,1);assert.equal(valid.notes.A1,'Keep me');
 assert.equal(valid.catalog.cards[1].group,'Housing');assert.equal(valid.catalog.cards[1].deleted,false);
});
test('archived destinations, invalid edited fields and full catalogs reject the entire insertion',()=>{
 const cards=G.parseResponse(response(),2),catalog=S.initial([],C).catalog;
 catalog.sets[0].deleted=true;assert.throws(()=>G.prepareAddition(catalog,'tcf-tache1',cards));catalog.sets[0].deleted=false;
 assert.throws(()=>G.prepareAddition(catalog,'tcf-tache1',[cards[0],{...cards[1],group:''}]));assert.equal(catalog.cards.length,0);
 catalog.cards=Array.from({length:20000},()=>({setId:'another-set',fr:'x',deleted:false}));assert.throws(()=>G.prepareAddition(catalog,'tcf-tache1',cards),/20000/);assert.equal(catalog.cards.length,20000);
});
