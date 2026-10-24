import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {exportSvg,importSvg,normalizeDoc,SvgImportError} from '../vectorio';
import {makeClip,releaseClip} from './clip';
import {ungroupSelection,groupSelection} from './groups';
import {applyBoolean} from './booleanOps';
import {offsetSelection} from './offsetOps';
import {splitPath} from './pathOps';
import {PathLayer} from '../../components/vectorstudio/render';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const doc3=()=>({width:200,height:100,paths:[{...rectPath({x:0,y:0,w:100,h:100}),id:'a',style:{fill:'#ff0000'}},{...rectPath({x:50,y:0,w:100,h:100}),id:'b',style:{fill:'#00ff00'}},{...rectPath({x:20,y:20,w:60,h:60}),id:'m',style:{fill:'#0000ff'}}]} as any);
const SVG=(defs:string,body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><defs>${defs}</defs>${body}</svg>`;

test('makeClip: the topmost object becomes the mask, members and mask share a new group, mask is last',()=>{
 const d=makeClip(doc3(),['a','b','m']),g=d.paths[0].group!;
 assert.ok(g);assert.ok(d.paths.every(p=>p.group===g));assert.deepEqual(d.paths.map(p=>[p.id,!!p.clip]),[['a',false],['b',false],['m',true]]);
 assert.throws(()=>makeClip(doc3(),['a']),/at least two/);
 assert.throws(()=>makeClip(d,['a','b','m']),/(Ungroup|least two)/);
});
test('makeClip / releaseClip commands: one undo step each, agent refused, release keeps the group, ungroup clears the mask too',async()=>{
 S.resetVectorSession();S.createBlankVector(200,100);for(const p of doc3().paths)S.addPath(p,false);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));const ps=()=>S.getVectorSession().doc.paths;
 S.select(['a','b','m']);
 await assert.rejects(d.runCommand('vector.makeClip',{},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 await d.runCommand('vector.makeClip',{},{origin:'test'});assert.equal(ps().filter(p=>p.clip).length,1);
 S.undo();assert.equal(ps().filter(p=>p.clip||p.group).length,0);S.select(['a','b','m']);
 await d.runCommand('vector.makeClip',{},{origin:'test'});S.select(['a']);
 await d.runCommand('vector.releaseClip',{},{origin:'test'});assert.equal(ps().filter(p=>p.clip).length,0);assert.ok(ps().every(p=>p.group));
 await assert.rejects(d.runCommand('vector.releaseClip',{},{origin:'test'}),/No clipping mask/);
 S.undo();assert.equal(ps().filter(p=>p.clip).length,1);
 const u=ungroupSelection(S.getVectorSession().doc,['a']);assert.ok(u.paths.every(p=>!p.group&&!p.clip));
});
test('operations that would consume the mask are refused with a clear message',()=>{
 const c=makeClip(doc3(),['a','b','m']);
 assert.throws(()=>applyBoolean(c,['a','b','m'],'union'),/Release the clipping mask/);
 assert.throws(()=>offsetSelection(c,['a'],2),/Release the clipping mask/);
 assert.throws(()=>groupSelection(c,['a','b']),/Release the clipping mask/);
 assert.throws(()=>splitPath(c,'m',c.paths[2].nodes[1].id),/Release the clipping mask/);
});
test('SVG: export writes <clipPath> and clip-path on the group; roundtrip is stable; files without masks are unchanged',()=>{
 const plain=exportSvg(normalizeDoc(doc3()));assert.ok(!plain.includes('clipPath')&&!plain.includes('clip-path'));
 const c=makeClip(doc3(),['a','b','m']),svg=exportSvg(normalizeDoc(c));
 assert.match(svg,/<clipPath id="vs-clip-g[^"]*">/);assert.match(svg,/<g data-vs-group="[^"]+" clip-path="url\(#vs-clip-/);assert.equal((svg.match(/<path /g)??[]).length,3); // 2 members + 1 clip shape
 const r=importSvg(svg);assert.equal(r.doc.paths.length,3);assert.equal(r.doc.paths.filter(p=>p.clip).length,1);assert.equal(r.doc.paths.at(-1)!.clip,true);
 assert.equal(exportSvg(normalizeDoc(r.doc)),svg);
});
test('SVG import: foreign clipPath on a group and on a single shape, transform applied, clip-rule kept',()=>{
 const g=importSvg(SVG('<clipPath id="c"><rect x="10" y="10" width="20" height="20"/></clipPath>','<g clip-path="url(#c)" transform="translate(100 0)"><rect width="50" height="50"/><circle cx="30" cy="30" r="10"/></g>')).doc;
 assert.equal(g.paths.length,3);const m=g.paths.find(p=>p.clip)!;assert.equal(m.nodes[0].x,110);assert.ok(g.paths.every(p=>p.group===m.group));
 const one=importSvg(SVG('<clipPath id="c" clip-rule="evenodd"><path clip-rule="evenodd" d="M0 0H10V10H0Z M2 2H8V8H2Z"/></clipPath>','<rect width="50" height="50" clip-path="url(#c)"/>')).doc;
 assert.equal(one.paths.length,3);assert.equal(one.paths.filter(p=>p.clip).length,2);assert.equal(one.paths.find(p=>p.clip)!.style?.fillRule,'evenodd');
 assert.ok(exportSvg(normalizeDoc(one)).includes('clip-rule="evenodd"'));
});
test('SVG import: unsupported clip uses are refused in strict mode and reported in lenient mode',()=>{
 const bad:[string,string,RegExp][]=[
  ['<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath>','<rect width="5" height="5" clip-path="url(#c)"/>',/objectBoundingBox/],
  ['<clipPath id="c"><rect width="5" height="5"/><rect width="9" height="9"/></clipPath>','<rect width="5" height="5" clip-path="url(#c)"/>',/exactly one shape/],
  ['','<rect width="5" height="5" clip-path="url(#nope)"/>',/clip-path/],
  ['<clipPath id="c"><g><rect width="5" height="5"/></g></clipPath>','<rect width="5" height="5" clip-path="url(#c)"/>',/exactly one shape/],
  ['<clipPath id="c"><rect width="5" height="5"/></clipPath>','<g data-vs-group="x"><rect width="5" height="5" clip-path="url(#c)"/></g>',/do not nest/],
  ['<clipPath id="c"><rect width="5" height="5"/></clipPath><mask id="m"/>','<rect width="5" height="5" clip-path="url(#c)"/>',/defs|mask/],
 ];
 for(const [defs,body,re] of bad){
  assert.throws(()=>importSvg(SVG(defs,body)),(e:unknown)=>e instanceof SvgImportError&&re.test(e.message),defs+body);
  assert.doesNotThrow(()=>importSvg(SVG(defs,body),{strict:false}));
 }
});
test('canvas render: mask shape is not painted, members sit inside a clipPath group',()=>{
 const c=makeClip(doc3(),['a','b','m']),html=renderToStaticMarkup(<svg><PathLayer paths={c.paths}/></svg>);
 assert.match(html,/<clipPath id="vsc-g/);assert.match(html,/clip-path="url\(#vsc-g/);
 assert.equal((html.match(/data-path-id=/g)??[]).length,2);assert.ok(!html.includes('data-path-id="m"'));
 const lone=renderToStaticMarkup(<svg><PathLayer paths={[{...c.paths[2]}]}/></svg>);assert.ok(lone.includes('data-path-id="m"')); // a mask without content is just a shape
});
