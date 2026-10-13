import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShell} from '../studios/vector';
import {validateStudioShell,resolveInspectorSections} from '../shell/panels';
import {effectiveRail} from '../shell/railResolver';
import {vectorCommandSpecs} from './commands';
import {vectorShellCommandSpecs} from './shellCommands';
import {VECTOR_CATALOGUES} from './i18n';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
test('vector manifest validates hosts, commands, all labels and inspector conditions',()=>{
 const ids=new Set(commands.map(s=>s.id));const hosts=new Set(vectorShell.panels!.map(s=>s.component)),sections=new Set(vectorShell.inspector!.sections.map(s=>s.component));
 const icons=new Set(['Files','Layers','Pencil','MousePointer2','VectorNode','VectorPen','Square','VectorEllipse','VectorLine','VectorPolygon','VectorStar','VectorExport','SlidersHorizontal']);
 assert.deepEqual(validateStudioShell('vector',vectorShell,{commandExists:id=>ids.has(id),hostExists:id=>hosts.has(id),sectionHostExists:id=>sections.has(id),iconExists:id=>icons.has(id)}),[]);
 const labels=[...vectorShell.panels!,...vectorShell.leftRail!,...vectorShell.rightRail!,...vectorShell.inspector!.sections].flatMap(x=>'labelKey' in x&&x.labelKey?[x.labelKey]:'titleKey' in x&&x.titleKey?[x.titleKey]:[]);
 for(const [tag,d] of Object.entries(VECTOR_CATALOGUES)){for(const k of labels)assert.ok(d[k],tag+':'+k);for(const c of commands)assert.ok(d['cmd.'+c.id],tag+':'+c.id);assert.deepEqual(Object.keys(d).sort(),Object.keys(VECTOR_CATALOGUES.en).sort());}
 const ctx={studio:'vector',selection:{kind:'none',count:0},services:{ready:true}};
 assert.deepEqual(resolveInspectorSections(vectorShell.inspector!.sections,ctx).map(s=>s.id),['page']);
 assert.deepEqual(resolveInspectorSections(vectorShell.inspector!.sections,{...ctx,selection:{kind:'one',count:1},services:{ready:true,node:true}}).map(s=>s.id),['page','transform','style','nodes']);
 assert.deepEqual(effectiveRail(vectorShell.leftRail!,undefined,{ctx}).overflow.map(s=>s.id),['rect','ellipse','line','polygon','star']);
 assert.deepEqual(effectiveRail(vectorShell.leftRail!,undefined,{ctx:{...ctx,services:{}}}).visible.map(s=>s.id),['files','layers','tools']);
});
test('typed shell tools, transforms and history reject invalid or remote writes',async()=>{
 S.resetVectorSession();S.createBlankVector();const p=rectPath({x:0,y:0,w:100,h:60});S.addPath(p);const before=structuredClone(S.getVectorSession().doc);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));
 await d.runCommand('vector.tool.node',{}, {origin:'test'});assert.equal(S.getVectorSession().tool,'node');
 await assert.rejects(d.runCommand('vector.rotateSelection',{degrees:'90'},{origin:'test'}),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.flipSelection',{axis:'vertical'},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.rotateSelection',{degrees:90},{origin:'test'});assert.notDeepEqual(S.getVectorSession().doc,before);S.undo();assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.flipSelection',{axis:'horizontal'},{origin:'test'});assert.equal(S.getVectorSession().doc.paths[0].nodes[0].x,100);S.undo();assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.rotateSelection',{degrees:0},{origin:'test'});assert.deepEqual(S.getVectorSession().doc,before);
});
