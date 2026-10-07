import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorProject,inlineStyleConflict,type EditorNode} from './index.js';
const page='<!doctype html>\n<html><head><title>t</title></head>\n<body><section class="card">x</section><div style="padding:8px">y</div><p style="padding-left:4px !important">z</p></body></html>';
const find=(p:EditorProject,tag:string)=>{let out:EditorNode|undefined;const walk=(ns:EditorNode[])=>{for(const n of ns){if(n.tag===tag)out=n;walk(n.children);}};walk(p.tree('index.html'));return out!;};
test('longhand padding commit writes only the changed sides and keeps the rest of the cascade',()=>{
 const p=new EditorProject({'index.html':page});const s=find(p,'section');
 p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:s.id,properties:{'padding-top':'24px','padding-bottom':'24px'}}]});
 const css=p.files['somnia-styles.css'];
 assert.match(css,/padding-top: 24px;/);assert.match(css,/padding-bottom: 24px;/);
 assert.doesNotMatch(css,/padding:/);assert.doesNotMatch(css,/padding-left/);assert.doesNotMatch(css,/!important/);
});
test('one padding commit is exactly one undo step, redo restores it',()=>{
 const p=new EditorProject({'index.html':page});const s=find(p,'section');const before={...p.files};
 p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:s.id,properties:{'padding-left':'40px','padding-right':'40px'}}]});
 assert.notDeepEqual(p.files,before);
 p.undo();assert.deepEqual(p.files,before);
 p.redo();assert.match(p.files['somnia-styles.css'],/padding-left: 40px;/);
});
test('asymmetric values survive: a second commit on another side leaves the first side intact',()=>{
 const p=new EditorProject({'index.html':page});const s=find(p,'section');
 p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:s.id,properties:{'padding-left':'10px'}}]});
 p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:find(p,'section').id,properties:{'padding-top':'30px'}}]});
 const css=p.files['somnia-styles.css'];assert.match(css,/padding-left: 10px;/);assert.match(css,/padding-top: 30px;/);
});
test('preflight: a longhand is refused when an inline shorthand would override it, and nothing is written',()=>{
 const p=new EditorProject({'index.html':page});const d=find(p,'div');const before={...p.files};
 assert.throws(()=>p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:d.id,properties:{'padding-top':'20px'}}]}),/inline style/);
 assert.deepEqual(p.files,before);
});
test('preflight: inline longhand (even !important) blocks the same longhand and the shorthand',()=>{
 const p=new EditorProject({'index.html':page});const el=find(p,'p');
 assert.throws(()=>p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:el.id,properties:{'padding-left':'20px'}}]}),/inline style/);
 assert.throws(()=>p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:el.id,properties:{padding:'20px'}}]}),/inline style/);
 p.transact({origin:'canvas',operations:[{type:'setStyle',file:'index.html',nodeId:el.id,properties:{'padding-top':'20px'}}]});
});
test('inlineStyleConflict only matches related properties',()=>{
 assert.equal(inlineStyleConflict('padding: 4px','padding-top'),true);
 assert.equal(inlineStyleConflict('padding-top: 4px','padding'),true);
 assert.equal(inlineStyleConflict('padding-top: 4px','padding-left'),false);
 assert.equal(inlineStyleConflict('margin: 0','padding-top'),false);
 assert.equal(inlineStyleConflict('color:red','color'),true);
});
