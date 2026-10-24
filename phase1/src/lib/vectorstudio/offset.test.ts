import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {flatten} from './geometry';
import {offsetSelection,outlineStroke} from './offsetOps';
import {strokePieces} from './strokeBand';
import {booleanContours} from './polyBoolean';
import {selectionBounds} from './transforms';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const area=(c:{x:number;y:number}[])=>{let s=0;for(let i=0;i<c.length;i++){const a=c[i],b=c[(i+1)%c.length];s+=a.x*b.y-b.x*a.y;}return Math.abs(s/2);};
const polyArea=(doc:ReturnType<typeof S.getVectorSession>['doc'])=>{const rule=doc.paths.length>1?'evenodd':'nonzero';void rule;return doc.paths.reduce((a,p,i)=>a+(i===0?1:-1)*area(flatten(p)),0);};
const reset=(p=rectPath({x:100,y:100,w:100,h:60}))=>{S.resetVectorSession();S.createBlankVector(400,300);S.addPath(p,true);return S.getVectorSession().doc.paths[0].id;};

test('offset: grow and shrink a rectangle by the expected amount; one undo step; bounds checked',async()=>{
 const id=reset();const d=new CommandDispatcher();commands.forEach(s=>d.register(s));const before=structuredClone(S.getVectorSession().doc);
 await assert.rejects(d.runCommand('vector.offsetPath',{distance:5},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 for(const bad of [0,0.001,501,-501])await assert.rejects(d.runCommand('vector.offsetPath',{distance:bad},{origin:'test'}));
 await assert.rejects(d.runCommand('vector.offsetPath',{distance:'x'},{origin:'test'}),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.offsetPath',{distance:10},{origin:'test'});
 const b=selectionBounds(S.getVectorSession().doc,S.getVectorSession().selection)!;
 assert.ok(Math.abs(b.x-90)<1e-3&&Math.abs(b.width-120)<1e-3&&Math.abs(b.height-80)<1e-3,JSON.stringify(b));
 const grown=polyArea(S.getVectorSession().doc);assert.ok(grown>100*60+2*10*(100+60)&&grown<120*80,String(grown)); // rounded corners: between plus-shape and full box
 S.undo();assert.deepEqual(S.getVectorSession().doc,before);S.select([id]);
 await d.runCommand('vector.offsetPath',{distance:-10},{origin:'test'});
 const s=selectionBounds(S.getVectorSession().doc,S.getVectorSession().selection)!;assert.ok(Math.abs(s.width-80)<1e-3&&Math.abs(s.height-40)<1e-3);
 await assert.rejects(d.runCommand('vector.offsetPath',{distance:-40},{origin:'test'}),/empty/);
 void id;
});
test('offset: open shapes and empty selection are refused, holes grow inward',()=>{
 const open={...rectPath({x:0,y:0,w:10,h:10}),closed:false};reset(open);
 assert.throws(()=>offsetSelection(S.getVectorSession().doc,S.getVectorSession().selection,2),/closed shapes/);
 assert.throws(()=>offsetSelection(S.getVectorSession().doc,[],2),/Select at least one/);
 S.resetVectorSession();S.createBlankVector(200,200);
 const outer=rectPath({x:0,y:0,w:100,h:100}),hole=rectPath({x:30,y:30,w:40,h:40});
 const doc={...S.getVectorSession().doc,paths:[{...outer,compound:'c1',style:{fillRule:'evenodd' as const}},{...hole,compound:'c1',style:{fillRule:'evenodd' as const}}]};
 const r=offsetSelection(doc,[doc.paths[0].id],5);
 assert.equal(r.ids.length,2);const sizes=r.doc.paths.map(p=>area(flatten(p))).sort((a,b)=>a-b);
 assert.ok(sizes[0]<40*40&&sizes[0]>29*29&&sizes[1]>110*110-40*40*0.3);
});
test('outline stroke: area matches width x length, joins follow lineJoin, caps follow lineCap, fill is kept',()=>{
 const line={id:'l',closed:false,nodes:[{id:'a',x:0,y:0,kind:'corner' as const},{id:'b',x:100,y:0,kind:'corner' as const}],style:{fill:'none',stroke:'#ff0000',strokeWidth:10}};
 const sq=(cap:'butt'|'square'|'round')=>{S.resetVectorSession();S.createBlankVector(300,300);S.addPath({...line,style:{...line.style,lineCap:cap}},true);const r=outlineStroke(S.getVectorSession().doc,['l']);return r.doc.paths.reduce((a,p)=>a+area(flatten(p)),0);};
 assert.ok(Math.abs(sq('butt')-1000)<1e-6);assert.ok(Math.abs(sq('square')-1100)<1e-6);const rd=sq('round');assert.ok(rd>1000+Math.PI*25*0.97&&rd<1000+Math.PI*25*1.01,String(rd));
 const id=reset({...rectPath({x:50,y:50,w:100,h:60}),style:{fill:'#00ff00',stroke:'#0000ff',strokeWidth:10,lineJoin:'miter'}});
 const miter=outlineStroke(S.getVectorSession().doc,[id]);
 assert.equal(miter.doc.paths.length,3); // kept fill + outer ring + hole (compound)
 assert.equal(miter.doc.paths[0].style?.stroke,'none');assert.equal(miter.doc.paths[0].style?.fill,'#00ff00');
 const ring=miter.doc.paths.slice(1);assert.equal(ring[0].style?.fill,'#0000ff');assert.equal(ring[0].style?.stroke,'none');
 const ringArea=Math.abs(area(flatten(ring[0]))-area(flatten(ring[1])));assert.ok(Math.abs(ringArea-(110*70-90*50))<1e-3,String(ringArea)); // miter keeps square corners
 const rnd=outlineStroke(S.getVectorSession().doc,[id]);void rnd;
 reset({...rectPath({x:50,y:50,w:100,h:60}),style:{fill:'none',stroke:'#0000ff',strokeWidth:10,lineJoin:'round'}});
 const r2=outlineStroke(S.getVectorSession().doc,[S.getVectorSession().doc.paths[0].id]).doc.paths;const a2=Math.abs(area(flatten(r2[0]))-area(flatten(r2[1])));
 assert.ok(a2<(110*70-90*50)&&a2>(110*70-90*50)-4*(100-Math.PI*25)*0.9,String(a2)); // rounded outer corners
 reset({...rectPath({x:50,y:50,w:100,h:60}),style:{fill:'none',stroke:'none'}});
 assert.throws(()=>outlineStroke(S.getVectorSession().doc,S.getVectorSession().selection),/visible stroke/);
 reset({...rectPath({x:50,y:50,w:100,h:60}),style:{stroke:'url(#g)',strokeWidth:2}});
 assert.throws(()=>outlineStroke(S.getVectorSession().doc,S.getVectorSession().selection),/Gradient strokes/);
});
test('strokeBand: unions of random polylines never lose coverage and stay finite',()=>{
 let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
 for(let k=0;k<60;k++){
  const pts=Array.from({length:2+Math.floor(rnd()*5)},()=>({x:rnd()*100,y:rnd()*100})),closed=rnd()<0.5&&pts.length>2;
  const pieces=strokePieces([{pts,closed}],2+rnd()*4,(['miter','round','bevel'] as const)[k%3],4,(['butt','round','square'] as const)[k%3]);
  const loops=booleanContours(pieces.map(c=>({contours:[c],rule:'nonzero' as const})).concat(pieces.length<2?[{contours:[pieces[0]],rule:'nonzero' as const}]:[]),'union');
  assert.ok(loops.length>0&&loops.every(l=>l.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))),`k=${k} pieces=${pieces.length} loops=${loops.length} ${JSON.stringify(pts)} closed=${closed}`);
  const a=loops.reduce((s,l)=>s+area(l),0);assert.ok(a>0,`k=${k} area`);
 }
 assert.throws(()=>strokePieces([],0,'miter',4,'butt'),RangeError);
});
test('boolean regression: a crossing computed from two edges lands on the same grid point',()=>{
 const A=[{x:90.91772380301644,y:32.08415025598438},{x:94.6591788828837,y:49.27775377961578},{x:88.7963837940972,y:50.55354128029953},{x:85.05492871422994,y:33.35993775666813}];
 const B=[{x:94.71635516525092,y:50.17723208990388},{x:90.69413836650293,y:96.13060125192759},{x:84.71699071298198,y:95.60743213203513},{x:88.73920751172997,y:49.654062970011424}];
 const o=(c:typeof A)=>({contours:[c],rule:'nonzero' as const});
 assert.equal(booleanContours([o(A),o(B)],'union').length,1);assert.equal(booleanContours([o(A),o(B)],'intersect').length,1);
});
