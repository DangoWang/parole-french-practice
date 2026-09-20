const test=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('../dist/hints.js');
test('each hint reveals independently; new questions hide both and confirmed answers reveal both',()=>{
 const nodes={};const doc={getElementById(id){return nodes[id]??=( {attributes:{},classList:{toggle(name,value){this[name]=value;}},setAttribute(k,v){this.attributes[k]=v;}});}};
 const hints=mount(doc),history=nodes['history-content'],notes=nodes['notes-content'];
 assert.equal(history.inert,true);assert.equal(notes.inert,true);
 nodes['history-visibility'].onclick();assert.equal(history.inert,false);assert.equal(notes.inert,true);
 nodes['notes-visibility'].onclick();assert.equal(notes.inert,false);
 hints.reset();assert.equal(history.inert,true);assert.equal(notes.inert,true);
 hints.reset(true);assert.equal(history.inert,false);assert.equal(notes.inert,false);assert.equal(notes.attributes['aria-hidden'],'false');
 hints.reset(true,false);assert.equal(nodes['notes-visibility'].disabled,true);
 hints.reset();assert.equal(nodes['notes-visibility'].disabled,false);assert.equal(nodes['notes-visibility'].attributes['aria-pressed'],'false');
});
