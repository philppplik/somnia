import test from 'node:test';import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {CollabDoc} from './collabDoc';
import {startBridge,type ProjectPort} from './projectBridge';
const made:CollabDoc[]=[];const mk=()=>{const d=new CollabDoc();made.push(d);return d;};
test.after(()=>made.forEach(d=>d.destroy()));
const sync=(a:Y.Doc,b:Y.Doc)=>{Y.applyUpdate(b,Y.encodeStateAsUpdate(a,Y.encodeStateVector(b)));Y.applyUpdate(a,Y.encodeStateAsUpdate(b,Y.encodeStateVector(a)));};
function port(init:Record<string,string>){
 let files={...init};const ls=new Set<()=>void>();
 const p:ProjectPort&{set(f:Record<string,string>):void;files():Record<string,string>}={
  files:()=>files,adopt(f){files={...f};},write(path,t){files={...files,[path]:t};},remove(path){const {[path]:_,...rest}=files;files=rest;},
  subscribe(fn){ls.add(fn);return()=>ls.delete(fn);},set(f){files=f;ls.forEach(l=>l());}};
 return p;}
function pair(initA:Record<string,string>){
 const A=mk(),B=mk();const pa=port(initA),pb=port({});
 for(const [k,v] of Object.entries(initA))A.text(k,v);
 startBridge(A,pa,{role:'host'});startBridge(B,pb,{role:'guest'});sync(A.doc,B.doc);
 return{A,B,pa,pb};}
test('creating, deleting and renaming files sync both ways',()=>{
 const {A,B,pa,pb}=pair({'index.html':'<p>a</p>','style.css':'p{}'});
 // guest adopt is not wired in this fake port: write what the guest would hold
 pb.set({'index.html':'<p>a</p>','style.css':'p{}'});sync(A.doc,B.doc);
 pa.set({...pa.files(),'about.html':'<p>about</p>'});sync(A.doc,B.doc);
 assert.equal(pb.files()['about.html'],'<p>about</p>');
 // host deletes
 const {['style.css']:_,...rest}=pa.files();pa.set(rest);sync(A.doc,B.doc);
 assert.equal('style.css' in pb.files(),false);assert.equal(B.files.has('style.css'),false);
 // guest renames about.html -> contact.html
 const {['about.html']:__,...r2}=pb.files();pb.set({...r2,'contact.html':'<p>about</p>'});sync(A.doc,B.doc);
 assert.equal('about.html' in pa.files(),false);assert.equal(pa.files()['contact.html'],'<p>about</p>');});
test('a remote delete does not discard unsaved local edits',()=>{
 const {A,B,pa,pb}=pair({'a.html':'one','b.html':'two'});
 pb.set({'a.html':'one','b.html':'two'});sync(A.doc,B.doc);
 pb.set({...pb.files(),'b.html':'two edited locally'});        // guest edits b.html
 const {['b.html']:_,...rest}=pa.files();pa.set(rest);          // host deletes b.html at the same time
 sync(A.doc,B.doc);
 assert.equal(pb.files()['b.html'],'two edited locally');
 sync(A.doc,B.doc);assert.equal(A.snapshot()['b.html'],'two edited locally','the edited file is shared again');});
test('an emptied or closed project does not delete the shared files',()=>{
 const {A,B,pa,pb}=pair({'a.html':'one'});pb.set({'a.html':'one'});sync(A.doc,B.doc);
 pa.set({});sync(A.doc,B.doc);
 assert.equal(A.files.has('a.html'),true);assert.equal(pb.files()['a.html'],'one');});
