import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignTextToPage} from './textAlign';
import {textBoxRotated,normalizeDoc,type VectorText} from '../vectorio';
import {ALIGN_MODES} from './transforms';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
const T=(p:Partial<VectorText>={}):VectorText=>({id:'t',x:50,y:60,text:'Hello\nworld',fontFamily:'Arial',fontSize:20,fontWeight:'normal',fontStyle:'normal',anchor:'start',fill:'#000000',...p});
const doc=(t:VectorText)=>normalizeDoc({width:400,height:300,paths:[],texts:[t]} as any);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<0.01,`${a} vs ${b}`);
test('every mode puts the box on the page edge or centre, for plain, centred and rotated text',()=>{
 for(const t of [T(),T({anchor:'middle',x:200}),T({anchor:'end',x:300,rotation:33}),T({rotation:-90})]){
  const d=doc(t),at=(m:any)=>textBoxRotated(alignTextToPage(d,'t',m).texts![0]);
  near(at('left').minX,0);near(at('right').maxX,400);near((at('centerX').minX+at('centerX').maxX)/2,200);
  near(at('top').minY,0);near(at('bottom').maxY,300);near((at('centerY').minY+at('centerY').maxY)/2,150);
 }
});
test('aligning one axis leaves the other untouched and the input document unchanged',()=>{
 const d=doc(T()),a=alignTextToPage(d,'t','left');assert.equal(a.texts![0].y,60);assert.equal(d.texts![0].x,50);assert.notEqual(a,d);
 assert.equal(alignTextToPage(d,'t','top').texts![0].x,50);
});
test('unknown id and unknown mode are refused',()=>{
 assert.throws(()=>alignTextToPage(doc(T()),'zzz','left'),/Unknown text/);assert.throws(()=>alignTextToPage(doc(T()),'t','diagonal' as any),RangeError);
 assert.equal(ALIGN_MODES.length,6);
});
test('vector.alignText: one undo step, schema-checked, agent blocked',async()=>{
 S.resetVectorSession();S.createBlankVector(400,300);const d=new CommandDispatcher();[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)].forEach(s=>d.register(s));
 const o={origin:'test'} as const;await d.runCommand('vector.addText',{x:150,y:100,text:'Align me'},o);const id=S.getVectorSession().textSel!;
 await d.runCommand('vector.alignText',{id,mode:'left'},o);near(textBoxRotated(S.getVectorSession().doc.texts![0]).minX,0);
 S.undo();assert.equal(S.getVectorSession().doc.texts![0].x,150);
 await assert.rejects(d.runCommand('vector.alignText',{id,mode:'nope'},o),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.alignText',{id:'zz',mode:'left'},o),/Unknown text/);
 await assert.rejects(d.runCommand('vector.alignText',{id,mode:'left'},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
});
