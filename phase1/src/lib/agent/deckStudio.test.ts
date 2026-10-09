import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {unzipSync,zipSync,strToU8} from 'fflate';
import {parseDeck,serializeDeck,createDeckStudioRegistry,deckAdapter} from './deckStudio';
import {readDeckDocument,editedDeckBytes,proposeDeck} from '../slides/deckDocument';import {diffDeck} from './deckReview';import {readRuns} from '../slides/editCopy';import type {DocumentSnapshot} from './documentCore';
const bytes=new Uint8Array(readFileSync('slides-engine/fixtures/independent.pptx'));const summary={slides:2,widthPt:960,heightPt:540};const doc=readDeckDocument(bytes,summary);const signal=()=>new AbortController().signal;
test('strict deck parse rejects unknown keys layouts ranges nested shapes and oversized/control text',()=>{
 assert.throws(()=>parseDeck('no'),/JSON/);assert.throws(()=>parseDeck('[]'),/object/);assert.throws(()=>parseDeck(JSON.stringify({...doc,extra:1})),/Unknown/);
 for(const mutate of [(d:typeof doc)=>{d.slides[0].layout='evil';},(d:typeof doc)=>{d.widthPt=0;},(d:typeof doc)=>{d.slides[0].index=99;},(d:typeof doc)=>{d.slides[0].texts[0].run=-1;},(d:typeof doc)=>{d.slides[0].texts[0].text='\u0000';},(d:typeof doc)=>{d.slides[0].texts[0].text='😀'.repeat(5000);}]){const d=structuredClone(doc);mutate(d);assert.throws(()=>parseDeck(JSON.stringify(d)));}
 assert.throws(()=>proposeDeck(doc,{changes:[{slide:99,run:0,text:'a'}]}),/range/);assert.throws(()=>proposeDeck(doc,{changes:[{slide:0,run:0,text:'a',layout:'x'}]}),/Unknown/);
 assert.throws(()=>proposeDeck(doc,{changes:[{slide:0,run:0,text:'a'},{slide:0,run:0,text:'b'}]}),/Duplicate/);assert.throws(()=>proposeDeck(doc,{changes:[]}),/no change/);assert.doesNotThrow(()=>deckAdapter.validate(serializeDeck(doc)));
});
test('canonical notes/layout extraction returns plain strings without binary parts',()=>{
 const zip=unzipSync(bytes);zip['ppt/slides/_rels/slide1.xml.rels']=strToU8('<Relationships><Relationship Id="r1" Type="x/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="r2" Type="x/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>');zip['ppt/notesSlides/notesSlide1.xml']=strToU8('<p:notes><a:t>Notes &amp; context</a:t></p:notes>');
 const d=readDeckDocument(zipSync(zip),summary);assert.deepEqual(d.slides[0].notes,['Notes & context']);assert.equal(d.slides[0].layout,'ppt/slideLayouts/slideLayout1.xml');assert.ok(!serializeDeck(d).includes('blob:'));
});
test('inspect read-only; proposal stages partial validated JSON without applying, with whitelist/abort/stale guards',async()=>{
 let s={ref:{documentId:'deck-1',path:'a.pptx',studioKind:'slides',revision:1,adapter:'deck-text-v1'},text:serializeDeck(doc)} as unknown as DocumentSnapshot;const stages:string[]=[];const r=createDeckStudioRegistry({snapshot:()=>s,propose:after=>{stages.push(after);}}),ctx={files:()=>({}),propose:async()=>{throw Error('Must not write');}};
 assert.deepEqual(r.definitions().map(d=>d.name),['deck_inspect','deck_propose_changes']);assert.equal(r.level('deck_inspect'),'read');assert.equal(r.level('deck_propose_changes'),'propose');
 const info=JSON.parse(await r.run('deck_inspect',{},ctx,signal()));assert.equal(info.binaryDisclosed,false);assert.deepEqual(info.deck,doc);
 await r.run('deck_propose_changes',{changes:[{slide:0,run:0,text:'AI review title'}]},ctx,signal());assert.equal(stages.length,1);assert.equal(parseDeck(s.text).slides[0].texts[0].text,doc.slides[0].texts[0].text);
 await assert.rejects(r.run('deck_inspect',{bytes:true},ctx,signal()),/Unexpected/);await assert.rejects(r.run('deck_propose_changes',{changes:[{slide:0,run:0,text:'x'}],extra:true},ctx,signal()),/Unexpected/);await assert.rejects(r.run('deck_inspect',{},ctx,AbortSignal.abort()));assert.equal(stages.length,1);
 const changing=createDeckStudioRegistry({snapshot:()=>{const previous=s;s={...s,ref:{...s.ref,revision:s.ref.revision+1}};return previous;},propose:()=>{throw Error('must not stage');}});await assert.rejects(changing.run('deck_propose_changes',{changes:[{slide:0,run:0,text:'x'}]},ctx,signal()),/changed/);
});
test('reviewed text-only output preserves original parts and rejects metadata mutations',()=>{
 const after=proposeDeck(doc,{changes:[{slide:0,run:0,text:'Reviewed & safe'}]});const out=editedDeckBytes(bytes,summary,after);assert.equal(readRuns(out)[0].text,'Reviewed & safe');const a=unzipSync(bytes),b=unzipSync(out);for(const name of Object.keys(a))if(name!==readRuns(bytes)[0].part)assert.deepEqual(b[name],a[name],name);assert.equal(diffDeck(serializeDeck(doc),serializeDeck(after)).length,1);
 after.slides[0].notes=['not implemented'];assert.throws(()=>editedDeckBytes(bytes,summary,after),/read-only/);
});
