import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {exportSvg,importSvg,normalizeDoc,parseGuides,formatGuides,GUIDE_LIMIT} from '../vectorio';
import {moveGuide,clearGuides} from './guideOps';
import {snapMove} from './snap';
import {tickStep} from '../../components/vectorstudio/VectorRulers';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const blank=()=>{S.resetVectorSession();S.createBlankVector(200,100);S.addPath(rectPath({x:0,y:0,w:10,h:10}),true);};

test('guides: add, move, remove through the command, one undo step each, agent refused, bad input rejected',async()=>{
 blank();const d=new CommandDispatcher();commands.forEach(s=>d.register(s));const g=()=>S.getVectorSession().doc.guides;
 await assert.rejects(d.runCommand('vector.moveGuide',{axis:'x',to:5},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 for(const bad of [{},{axis:'z',to:1},{axis:'x'},{axis:'x',to:'1'},{axis:'x',to:1e9},{axis:'x',to:NaN}])await assert.rejects(d.runCommand('vector.moveGuide',bad,{origin:'test'}));
 await d.runCommand('vector.moveGuide',{axis:'x',to:50.12345},{origin:'test'});assert.deepEqual(g(),{x:[50.123],y:[]});
 await d.runCommand('vector.moveGuide',{axis:'y',to:20},{origin:'test'});
 await assert.rejects(d.runCommand('vector.moveGuide',{axis:'y',to:20},{origin:'test'}),/already/);
 await assert.rejects(d.runCommand('vector.moveGuide',{axis:'y',from:21},{origin:'test'}),/No such guide/);
 await d.runCommand('vector.moveGuide',{axis:'x',from:50.123,to:70},{origin:'test'});assert.deepEqual(g(),{x:[70],y:[20]});
 await d.runCommand('vector.moveGuide',{axis:'y',from:20},{origin:'test'});assert.deepEqual(g(),{x:[70],y:[]});
 S.undo();assert.deepEqual(g(),{x:[70],y:[20]});
 await d.runCommand('vector.clearGuides',{},{origin:'test'});assert.equal(g(),undefined);
 await assert.rejects(d.runCommand('vector.clearGuides',{},{origin:'test'}),/No guides/);
});
test('guides: limit of 100',()=>{
 let doc:any={width:10,height:10,paths:[]};for(let i=0;i<GUIDE_LIMIT;i++)doc=moveGuide(doc,i%2?'x':'y',undefined,i);
 assert.throws(()=>moveGuide(doc,'x',undefined,5000),/At most/);assert.equal(clearGuides(doc).guides,undefined);
});
test('guides: SVG roundtrip, old files unchanged, malformed attribute is a warning',()=>{
 blank();const s=()=>S.getVectorSession().doc;const plain=exportSvg(s());assert.ok(!plain.includes('data-vs-guides'));
 const doc=moveGuide(moveGuide(s(),'x',undefined,10),'y',undefined,5.5);const svg=exportSvg(doc);assert.ok(svg.includes('data-vs-guides="x:10;y:5.5"'));
 const r=importSvg(svg);assert.deepEqual(r.doc.guides,{x:[10],y:[5.5]});assert.equal(exportSvg(normalizeDoc(r.doc)),svg);
 const bad=importSvg(svg.replace('x:10;y:5.5','nonsense'));assert.equal(bad.doc.guides,undefined);assert.ok(bad.warnings.some(w=>/data-vs-guides/.test(w.message)));
 for(const v of ['x:1;y:','x:;y:','x:1e400;y:1','x:a;y:','x:1,2,3;y:4'])assert.ok(parseGuides(v)===null||typeof parseGuides(v)==='object');
 assert.equal(parseGuides('x:'+'1,'.repeat(3000)+'1;y:'),null);assert.equal(formatGuides({x:[1],y:[]}),'x:1;y:');
});
test('guides: a moved selection snaps to a user guide',()=>{
 const box={minX:0,minY:0,maxX:10,maxY:10};
 const r=snapMove(box,38.5,0,[{minX:50,maxX:50,minY:Infinity,maxY:Infinity}],3);assert.equal(r.dx+box.maxX,50);assert.deepEqual(r.guides.x,[50]);
 const far=snapMove(box,10,7,[{minX:50,maxX:50,minY:Infinity,maxY:Infinity}],3);assert.equal(far.dx,10);assert.equal(far.dy,7);
 const h=snapMove(box,0,17.4,[{minY:30,maxY:30,minX:Infinity,maxX:Infinity}],3);assert.equal(h.dy+box.maxY,30);
});
test('rulers: tick step is a 1-2-5 value and keeps labels apart',()=>{
 for(const z of [0.05,0.1,0.5,1,2,8,32]){const st=tickStep(z);assert.ok(st*z>=60-1e-9);assert.ok([1,2,5].includes(Number((st/Math.pow(10,Math.floor(Math.log10(st)))).toFixed(6))));}
});
