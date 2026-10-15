import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {exportSvg,importSvg,normalizeDoc,swatchColor,SWATCH_LIMIT} from '../vectorio';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const setup=()=>{S.resetVectorSession();S.createBlankVector(100,100);S.addPath({...rectPath({x:0,y:0,w:10,h:10}),id:'a',style:{fill:'#ff0000'}} as any,false);S.select(['a']);const d=new CommandDispatcher();commands.forEach(s=>d.register(s));return d;};
const o={origin:'test'} as const;
test('add, apply and remove swatches: one undo step each, agent refused, duplicates and unknown colours are errors',async()=>{
 const d=setup();await d.runCommand('vector.addSwatch',{color:'#F00'},o);assert.deepEqual(S.getVectorSession().doc.swatches,['#ff0000']);
 await assert.rejects(d.runCommand('vector.addSwatch',{color:'#ff0000'},o),/already exists/);
 await assert.rejects(d.runCommand('vector.addSwatch',{color:'red'},{origin:'test'}));
 await assert.rejects(d.runCommand('vector.addSwatch',{color:'#00f'},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 await d.runCommand('vector.addSwatch',{color:'#0000ff'},o);
 await d.runCommand('vector.applySwatch',{color:'#0000ff',target:'stroke'},o);assert.equal(S.getVectorSession().doc.paths[0].style?.stroke,'#0000ff');
 await assert.rejects(d.runCommand('vector.applySwatch',{color:'#00ff00',target:'fill'},o),/No such swatch/);
 S.undo();S.select(['a']);assert.equal(S.getVectorSession().doc.paths[0].style?.stroke,undefined);
 await d.runCommand('vector.removeSwatch',{color:'#ff0000'},o);assert.deepEqual(S.getVectorSession().doc.swatches,['#0000ff']);
 await d.runCommand('vector.removeSwatch',{color:'#0000ff'},o);assert.equal(S.getVectorSession().doc.swatches,undefined);
 await assert.rejects(d.runCommand('vector.removeSwatch',{color:'#0000ff'},o),/No such swatch/);
});
test('palette is bounded at the limit',async()=>{
 const d=setup();for(let i=0;i<SWATCH_LIMIT;i++)await d.runCommand('vector.addSwatch',{color:'#'+(i+4096).toString(16).padStart(6,'0')},o);
 await assert.rejects(d.runCommand('vector.addSwatch',{color:'#ffffff'},o),/At most/);
});
test('swatches roundtrip through data-vs-swatches; malformed values are ignored with a warning',()=>{
 const doc=normalizeDoc({width:10,height:10,paths:[],swatches:['#FF0000','#f00','#00ff00','bad']} as any);assert.deepEqual(doc.swatches,['#ff0000','#00ff00']);
 const out=exportSvg(doc);assert.match(out,/data-vs-swatches="#ff0000,#00ff00"/);assert.deepEqual(importSvg(out).doc.swatches,['#ff0000','#00ff00']);
 const bad=importSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-vs-swatches="#ff0000,url(x)"><path d="M0 0H5V5Z"/></svg>');assert.equal(bad.doc.swatches,undefined);
 assert.ok(!/swatches/.test(exportSvg(normalizeDoc({width:10,height:10,paths:[]} as any))));
 assert.equal(swatchColor('#ABC'),'#aabbcc');assert.equal(swatchColor('#aabbccdd'),null);
});
