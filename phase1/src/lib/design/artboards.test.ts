import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignDocument,createNode,parseDesignDocument,type DesignDocument} from './model';
import {ARTBOARD_PRESETS,MAX_ARTBOARDS,addArtboard,deleteArtboard,documentPalette,documentStats,duplicateArtboard,fitZoom,moveArtboard,nextArtboardName,nudgeNodes,presetFor,renameArtboard,resizeArtboard,restack,setArtboardBackground,swapArtboardOrientation} from './artboards';
const doc=():DesignDocument=>{const d=createDesignDocument();d.artboards[0].nodes=[createNode('rectangle',0),createNode('text',1),createNode('rectangle',2)].map((n,i)=>({...n,id:`n${i}`}));return d;};
test('presets are unique, in range, and matched by exact size',()=>{
 assert.equal(new Set(ARTBOARD_PRESETS.map(p=>p.id)).size,ARTBOARD_PRESETS.length);
 for(const p of ARTBOARD_PRESETS){assert.ok(p.width>=1&&p.width<=16384&&p.height>=1&&p.height<=16384);assert.equal(presetFor(p.width,p.height),p.id);}
 assert.equal(presetFor(1,1),null);
});
test('addArtboard appends a valid artboard and respects the limit',()=>{
 const d=doc();const r=addArtboard(d,{width:1080,height:1920,name:'Story'});
 assert.ok(r.id);assert.equal(r.doc.artboards.length,2);assert.equal(r.doc.artboards[1].name,'Story');
 parseDesignDocument(JSON.stringify(r.doc));
 assert.equal(d.artboards.length,1,'input is not mutated');
 let full=d;for(let i=0;i<MAX_ARTBOARDS-1;i++)full=addArtboard(full).doc;
 assert.equal(full.artboards.length,MAX_ARTBOARDS);assert.equal(addArtboard(full).id,null);assert.equal(addArtboard(full).doc,full);
 assert.equal(new Set(full.artboards.map(a=>a.name)).size,MAX_ARTBOARDS,'generated names stay unique');
});
test('nextArtboardName skips taken names',()=>{const d=doc();d.artboards[0].name='Artboard 2';assert.equal(nextArtboardName(d),'Artboard 3');});
test('duplicateArtboard copies layers with fresh ids right behind the original',()=>{
 const d=addArtboard(doc()).doc;const r=duplicateArtboard(d,d.artboards[0].id);
 assert.equal(r.doc.artboards.length,3);assert.equal(r.doc.artboards[1].id,r.id);assert.equal(r.doc.artboards[1].name,'Artboard 1 copy');
 const ids=r.doc.artboards.flatMap(a=>a.nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);
 assert.equal(r.doc.artboards[1].nodes.length,3);parseDesignDocument(JSON.stringify(r.doc));
 assert.equal(duplicateArtboard(d,'nope').id,null);
});
test('deleteArtboard keeps at least one artboard and picks a neighbour',()=>{
 const d=addArtboard(addArtboard(doc()).doc).doc;const [a,b,c]=d.artboards;
 const r=deleteArtboard(d,b.id);assert.deepEqual(r.doc.artboards.map(x=>x.id),[a.id,c.id]);assert.equal(r.next,c.id);
 assert.equal(deleteArtboard(d,c.id).next,b.id);
 const one=doc();assert.equal(deleteArtboard(one,one.artboards[0].id).next,null);assert.equal(deleteArtboard(one,one.artboards[0].id).doc,one);
});
test('rename ignores blank names; move swaps neighbours and stops at the ends',()=>{
 const d=addArtboard(doc()).doc;
 assert.equal(renameArtboard(d,d.artboards[0].id,'   '),d);assert.equal(renameArtboard(d,d.artboards[0].id,'  Hero ').artboards[0].name,'Hero');
 assert.deepEqual(moveArtboard(d,d.artboards[0].id,1).artboards.map(a=>a.id),[d.artboards[1].id,d.artboards[0].id]);
 assert.equal(moveArtboard(d,d.artboards[0].id,-1),d);assert.equal(moveArtboard(d,d.artboards[1].id,1),d);
});
test('resize clamps to the model range and keeps layers; orientation swap is its own inverse',()=>{
 const d=doc();const id=d.artboards[0].id;
 const r=resizeArtboard(d,id,99999,0);assert.equal(r.artboards[0].width,16384);assert.equal(r.artboards[0].height,1);assert.equal(r.artboards[0].nodes.length,3);
 assert.equal(resizeArtboard(d,id,NaN,10),d);
 const s=swapArtboardOrientation(d,id);assert.deepEqual([s.artboards[0].width,s.artboards[0].height],[640,960]);
 assert.deepEqual(swapArtboardOrientation(s,id).artboards[0],d.artboards[0]);parseDesignDocument(JSON.stringify(r));
});
test('background accepts six-digit hex only',()=>{
 const d=doc();const id=d.artboards[0].id;
 assert.equal(setArtboardBackground(d,id,'#ABCDEF').artboards[0].background,'#abcdef');
 assert.equal(setArtboardBackground(d,id,'red'),d);assert.equal(setArtboardBackground(d,id,'#fff'),d);
});
test('fitZoom shows the whole artboard and stays within 10..400%',()=>{
 const z=fitZoom({width:1000,height:500},{width:1080,height:580});assert.ok(z*1000<=920&&z*500<=420);
 assert.equal(fitZoom({width:10,height:10},{width:5000,height:5000}),4);assert.equal(fitZoom({width:16384,height:16384},{width:200,height:200}),0.1);
});
test('documentPalette counts background, fills and visible strokes, most used first',()=>{
 const d=doc();const b=d.artboards[0];b.background='#FFFFFF';
 b.nodes[0].fill='#112233';b.nodes[1].fill='#112233';b.nodes[2].fill='#445566';b.nodes[2].stroke='#778899';b.nodes[2].strokeWidth=2;b.nodes[0].stroke='#aaaaaa';b.nodes[0].strokeWidth=0;
 const p=documentPalette(b);
 assert.deepEqual(p.map(x=>x.color),['#112233','#ffffff','#445566','#778899']);
 assert.equal(p[0].uses,2);assert.deepEqual(p[3].roles,['stroke']);assert.ok(!p.some(x=>x.color==='#aaaaaa'));
});
test('restack moves selected unlocked layers and keeps the rest in order',()=>{
 const ns=doc().artboards[0].nodes.map(n=>({...n}));const ids=(a:{id:string}[])=>a.map(n=>n.id);
 assert.deepEqual(ids(restack(ns,['n0'],'front')),['n1','n2','n0']);
 assert.deepEqual(ids(restack(ns,['n2'],'back')),['n2','n0','n1']);
 assert.deepEqual(ids(restack(ns,['n0'],'forward')),['n1','n0','n2']);
 assert.deepEqual(ids(restack(ns,['n2'],'backward')),['n0','n2','n1']);
 assert.deepEqual(ids(restack(ns,['n2'],'forward')),['n0','n1','n2'],'top layer stays');
assert.deepEqual(ids(restack(ns,['n0','n1'],'forward')),['n2','n0','n1']);
 ns[0].locked=true;assert.deepEqual(ids(restack(ns,['n0'],'front')),['n0','n1','n2'],'locked layers do not move');
 assert.deepEqual(ids(restack(ns,[],'front')),['n0','n1','n2']);
});
test('nudgeNodes moves unlocked layers and clamps',()=>{
 const ns=doc().artboards[0].nodes.map(n=>({...n}));ns[1].locked=true;
 const out=nudgeNodes(ns,['n0','n1'],10,-5);assert.equal(out[0].x,ns[0].x+10);assert.equal(out[0].y,ns[0].y-5);assert.equal(out[1].x,ns[1].x);
 assert.equal(nudgeNodes([{...ns[0],x:32768}],['n0'],10,0)[0].x,32768);
});
test('documentStats counts layers, hidden and locked',()=>{
 const d=doc();d.artboards[0].nodes[0].hidden=true;d.artboards[0].nodes[1].locked=true;
 assert.deepEqual(documentStats(addArtboard(d).doc),{artboards:2,layers:3,hidden:1,locked:1});
});
