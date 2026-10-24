import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {copyStyle,pickStyle,clearStyleBuffer,hasStyleBuffer} from './styleClip';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const setup=()=>{clearStyleBuffer();S.resetVectorSession();S.createBlankVector(200,100);
 S.addPath({...rectPath({x:0,y:0,w:50,h:50}),id:'a',style:{fill:'#ff0000',stroke:'#000000',strokeWidth:3,dashArray:[4,2],opacity:0.5}} as any,false);
 S.addPath({...rectPath({x:60,y:0,w:50,h:50}),id:'b',style:{fill:'#00ff00',stroke:'none',strokeWidth:1}} as any,false);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));return d;};
const st=(id:string)=>S.getVectorSession().doc.paths.find(p=>p.id===id)!.style!;
test('copy then paste style: one undo step, geometry untouched, agent origin refused, paste disabled until a copy',async()=>{
 const d=setup();S.select(['b']);
 await assert.rejects(d.runCommand('vector.pasteStyle',{},{origin:'test'}));
 S.select(['a']);await d.runCommand('vector.copyStyle',{},{origin:'test'});assert.ok(hasStyleBuffer());
 await assert.rejects(d.runCommand('vector.copyStyle',{},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 S.select(['b']);const before=S.getVectorSession().doc.paths.find(p=>p.id==='b')!.nodes;
 await d.runCommand('vector.pasteStyle',{},{origin:'test'});
 assert.equal(st('b').fill,'#ff0000');assert.equal(st('b').strokeWidth,3);assert.deepEqual(st('b').dashArray,[4,2]);assert.equal(st('b').opacity,0.5);
 assert.deepEqual(S.getVectorSession().doc.paths.find(p=>p.id==='b')!.nodes,before);
 S.undo();S.select(['b']);assert.equal(st('b').fill,'#00ff00');
});
test('the buffer is a snapshot: later edits to the source do not leak, and several targets change in one step',async()=>{
 const d=setup();S.select(['a']);await d.runCommand('vector.copyStyle',{},{origin:'test'});
 S.setStyle({fill:'#123456'},['a']);S.select(['a','b']);await d.runCommand('vector.pasteStyle',{},{origin:'test'});
 assert.equal(st('b').fill,'#ff0000');S.undo();S.select(['a','b']);assert.equal(st('b').fill,'#00ff00');assert.equal(st('a').fill,'#123456');
});
test('pickStyle takes the topmost selected object, ignores unknown keys, bad values and clip masks; empty selection copies nothing',()=>{
 setup();const doc=S.getVectorSession().doc;
 const odd={...doc,paths:doc.paths.map(p=>p.id==='b'?{...p,style:{...p.style,evil:'x',strokeWidth:NaN,dashArray:new Array(100).fill(1)} as any}:p)};
 const s=pickStyle(odd,['a','b'])!;assert.equal(s.fill,'#00ff00');assert.ok(!('evil' in s));assert.ok(!('strokeWidth' in s));assert.ok(!('dashArray' in s));
 const masked={...doc,paths:doc.paths.map(p=>p.id==='b'?{...p,group:'g',clip:true as const}:{...p,group:'g'})};
 assert.equal(pickStyle(masked,['a','b'])!.fill,'#ff0000');
 assert.equal(copyStyle(doc,[]),false);
});
test('a pasted gradient fill that does not exist in the document is dropped',async()=>{
 setup();S.select(['b']);S.setStyle({fill:'url(#nope)'},['b']);assert.notEqual(st('b').fill,'url(#nope)');
});
