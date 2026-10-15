import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {exportSvg,importSvg,normalizeDoc,normalizeText,textBox,SvgImportError,TEXT_LIMITS,type VectorText} from '../vectorio';
import {exportAreaDoc} from './exportArea';
import {familiesOf,fontOptions} from './fonts';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const o={origin:'test'} as const;
const setup=()=>{S.resetVectorSession();S.createBlankVector(400,300);const d=new CommandDispatcher();commands.forEach(s=>d.register(s));return d;};
const T=(p:Partial<VectorText>={})=>({id:'t1',x:10,y:40,text:'Hello',fontFamily:'Georgia',fontSize:24,fontWeight:'normal' as const,fontStyle:'normal' as const,anchor:'start' as const,fill:'#112233',...p});
const doc=(t:VectorText)=>normalizeDoc({width:200,height:100,paths:[],texts:[t]} as any);
test('add, edit, move and delete text: one undo step each, agent origin refused, selection follows',async()=>{
 const d=setup();
 await assert.rejects(d.runCommand('vector.addText',{x:5,y:5},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 await d.runCommand('vector.addText',{x:20,y:50,text:'Hi',fontFamily:'Arial'},o);
 const id=S.getVectorSession().textSel!;assert.ok(id);assert.equal(S.getVectorSession().doc.texts![0].fontFamily,'Arial');
 await d.runCommand('vector.setText',{id,patch:{text:'Hallo\nWelt',fontSize:30,x:60}},o);
 const t=S.getVectorSession().doc.texts![0];assert.equal(t.text,'Hallo\nWelt');assert.equal(t.x,60);
 S.undo();assert.equal(S.getVectorSession().doc.texts![0].text,'Hi');
 S.redo();await d.runCommand('vector.deleteText',{id},o);assert.equal(S.getVectorSession().doc.texts,undefined);assert.equal(S.getVectorSession().textSel,null);
 S.undo();assert.equal(S.getVectorSession().doc.texts![0].id,id);
 await assert.rejects(d.runCommand('vector.setText',{id:'nope',patch:{x:1}},o),/Unknown text/);
 await assert.rejects(d.runCommand('vector.setText',{id,patch:{text:'  '}},o),/empty/);
});
test('selecting a path clears the text selection and the other way round',async()=>{
 const d=setup();S.addPath({...rectPath({x:0,y:0,w:10,h:10}),id:'a'} as any,false);
 await d.runCommand('vector.addText',{x:20,y:50},o);assert.ok(S.getVectorSession().textSel);
 S.select(['a']);assert.equal(S.getVectorSession().textSel,null);
 S.selectText(S.getVectorSession().doc.texts![0].id);assert.deepEqual(S.getVectorSession().selection,[]);
});
test('text roundtrips through SVG, multi-line, entities, bold/italic/anchor; family and colour are validated',()=>{
 const t=T({text:'A & <B>\nline "2"',fontWeight:'bold',fontStyle:'italic',anchor:'middle',fontFamily:"Helvetica Neue"});
 const out=exportSvg(doc(t));assert.match(out,/<text data-vs-text="1"/);assert.match(out,/font-weight="bold"/);
 const back=importSvg(out).doc.texts![0];assert.equal(back.text,t.text);assert.equal(back.anchor,'middle');assert.equal(back.fontStyle,'italic');assert.equal(back.fontFamily,'Helvetica Neue');
 const bad=normalizeText({...T(),fontFamily:'x";}<script>',fill:'red',fontSize:99999,anchor:'bogus' as any})!;
 assert.equal(bad.fontFamily,'sans-serif');assert.equal(bad.fill,'#000000');assert.equal(bad.fontSize,TEXT_LIMITS.maxSize);assert.equal(bad.anchor,'start');
 assert.equal(normalizeText({...T(),text:'a'.repeat(5000)})!.text.length,TEXT_LIMITS.maxChars);
 assert.equal(normalizeText({...T(),text:'\u0000\u0007x'})!.text,'x');
});
test('strict import: foreign <text>, transforms, CSS, nested markup and texts inside groups are refused',()=>{
 const S=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
 for(const b of ['<text x="1" y="2">hi</text>','<text data-vs-text="1" x="1" y="2" font-family="Arial" font-size="12" fill="#000" transform="rotate(5)">hi</text>',
  '<text data-vs-text="1" x="1" y="2" font-family="Arial" font-size="12" fill="#000" style="font-size:20px">hi</text>',
  '<text data-vs-text="1" x="1" y="2" font-family="Arial" font-size="12" fill="#000"><tspan><tspan>x</tspan></tspan></text>',
  '<text data-vs-text="1" x="1" y="2" font-family="Arial" font-size="12" fill="red">hi</text>',
  '<g><text data-vs-text="1" x="1" y="2" font-family="Arial" font-size="12" fill="#000">hi</text></g>'])
  assert.throws(()=>importSvg(S(b)),SvgImportError,b);
 assert.equal(importSvg(S('<text data-vs-text="1" x="1" y="2" font-family="Arial" font-size="12" fill="#000">hi</text>')).doc.texts![0].text,'hi');
});
test('limits: at most 200 text objects; Fit to content includes texts, Selection drops them',async()=>{
 const d=setup();for(let i=0;i<TEXT_LIMITS.maxTexts;i++)S.addText({x:i,y:20});
 assert.throws(()=>S.addText({x:1,y:1}),/At most 200/);void d;
 const dd=doc(T({x:50,y:60}));const c=exportAreaDoc(dd,[],'content',0);assert.ok(c.texts&&c.texts[0].x<50&&c.width>0);
 const b=textBox(T());assert.ok(b.maxX>b.minX&&b.maxY>b.minY);
 const withPath=normalizeDoc({...dd,paths:[{...rectPath({x:0,y:0,w:10,h:10}),id:'a'}]} as any);assert.equal(exportAreaDoc(withPath,['a'],'selection').texts,undefined);
});
test('fonts: only valid family names are offered, sorted and unique; the current value always stays selectable',()=>{
 assert.deepEqual(familiesOf([{family:'Zed'},{family:'Alpha'},{family:'Alpha'},{family:'bad;name'},{family:42},{}]),['Alpha','Zed']);
 assert.ok(fontOptions('Comic Neue',['Alpha']).includes('Comic Neue'));assert.ok(fontOptions('Arial',['Arial','Alpha']).filter(f=>f==='Arial').length===1);
});
test('copy/paste: a selected text round-trips through the clipboard SVG, offset, new id, one undo step; paths copy never drags texts along',async()=>{
 const {selectionSvg,pasteSvgText,PASTE_OFFSET}=await import('./clipboard');
 const d=setup();await d.runCommand('vector.addText',{x:30,y:40,text:'Copy\nme',fontWeight:'bold'},o);
 const g=S.getVectorSession(),id=g.textSel!;const svg=selectionSvg(g.doc,[],id)!;assert.match(svg,/data-vs-text/);
 assert.ok(pasteSvgText(svg));const ts=S.getVectorSession().doc.texts!;assert.equal(ts.length,2);
 assert.notEqual(ts[1].id,id);assert.equal(ts[1].x,30+PASTE_OFFSET);assert.equal(ts[1].text,'Copy\nme');assert.equal(ts[1].fontWeight,'bold');assert.equal(S.getVectorSession().textSel,ts[1].id);
 S.undo();assert.equal(S.getVectorSession().doc.texts!.length,1);
 S.addPath({...rectPath({x:0,y:0,w:10,h:10}),id:'a'} as any,false);S.select(['a']);
 assert.equal(/data-vs-text/.test(selectionSvg(S.getVectorSession().doc,['a'],id)!),false);
 S.select([]);assert.equal(selectionSvg(S.getVectorSession().doc,[],null),null);
});
test('paste respects the 200 text cap and never changes the document on failure',async()=>{
 const {selectionSvg,pasteSvgText}=await import('./clipboard');
 setup();for(let i=0;i<TEXT_LIMITS.maxTexts;i++)S.addText({x:i,y:1});
 const g=S.getVectorSession(),svg=selectionSvg(g.doc,[],g.doc.texts![0].id)!;
 assert.equal(pasteSvgText(svg),false);assert.equal(S.getVectorSession().doc.texts!.length,TEXT_LIMITS.maxTexts);assert.match(S.getVectorSession().error??'',/At most 200/);
});
test('text rotation and opacity: roundtrip, strict parse, bounds and hit frame follow the rotation',async()=>{
 const {textBoxRotated,unrotateAround}=await import('../vectorio');
 const t=T({x:50,y:60,rotation:90,opacity:0.5});const out=exportSvg(doc(t));
 assert.match(out,/transform="rotate\(90 50 60\)"/);assert.match(out,/opacity="0.5"/);
 const back=importSvg(out).doc.texts![0];assert.equal(back.rotation,90);assert.equal(back.opacity,0.5);
 const plain=importSvg(exportSvg(doc(T()))).doc.texts![0];assert.equal(plain.rotation,undefined);assert.equal(plain.opacity,undefined);
 const W=(a:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text data-vs-text="1" x="50" y="60" font-family="Arial" font-size="12" fill="#000" ${a}>hi</text></svg>`;
 for(const a of ['transform="rotate(90 1 1)"','transform="translate(5 5)"','transform="rotate(400 50 60)"','transform="rotate(NaN 50 60)"','opacity="2"','opacity="-1"','opacity="abc"'])assert.throws(()=>importSvg(W(a)),SvgImportError,a);
 const n=normalizeText({...T(),rotation:1e9,opacity:-5})!;assert.equal(n.rotation,360);assert.equal(n.opacity,0);
 const b0=textBox(T({x:50,y:60})),b=textBoxRotated(t);assert.ok(Math.abs((b.maxX-b.minX)-(b0.maxY-b0.minY))<1e-6);
 const u=unrotateAround({x:50,y:60,rotation:90},{x:50,y:100});assert.ok(Math.abs(u.x-90)<1e-6&&Math.abs(u.y-60)<1e-6);
 const d=setup();await d.runCommand('vector.addText',{x:20,y:50,rotation:30},o);const id=S.getVectorSession().textSel!;
 await d.runCommand('vector.setText',{id,patch:{rotation:-45,opacity:0.25}},o);assert.equal(S.getVectorSession().doc.texts![0].rotation,-45);
 await assert.rejects(d.runCommand('vector.setText',{id,patch:{rotation:999}},o),CommandDispatchError);
 S.undo();assert.equal(S.getVectorSession().doc.texts![0].rotation,30);
});
test('duplicate text: offset copy with new id and selection, one undo step, cap and unknown id refused, agent blocked',async()=>{
 const d=setup();await assert.rejects(d.runCommand('vector.duplicateText',{id:'x'},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 await d.runCommand('vector.addText',{x:10,y:20,text:'Dup',rotation:15,opacity:0.5},o);const id=S.getVectorSession().textSel!;
 await d.runCommand('vector.duplicateText',{id},o);const ts=S.getVectorSession().doc.texts!;
 assert.equal(ts.length,2);assert.notEqual(ts[1].id,id);assert.equal(ts[1].x,22);assert.equal(ts[1].rotation,15);assert.equal(ts[1].opacity,0.5);assert.equal(S.getVectorSession().textSel,ts[1].id);
 S.undo();assert.equal(S.getVectorSession().doc.texts!.length,1);
 await assert.rejects(d.runCommand('vector.duplicateText',{id:'nope'},o),/Unknown text/);
 for(let i=1;i<TEXT_LIMITS.maxTexts;i++)S.addText({x:i,y:1});
 assert.throws(()=>S.duplicateText(id),/At most 200/);assert.equal(S.getVectorSession().doc.texts!.length,TEXT_LIMITS.maxTexts);
});
test('text stacking: back texts are written before the shapes, read back, and strictly validated',async()=>{
 const d=normalizeDoc({width:200,height:100,paths:[{...rectPath({x:0,y:0,w:10,h:10}),id:'a'}],texts:[T({id:'f'}),T({id:'b',back:true,text:'Back'})]} as any);
 const out=exportSvg(d);assert.ok(out.indexOf('data-vs-back')<out.indexOf('<path'));assert.ok(out.indexOf('<path')<out.lastIndexOf('<text'));
 const back=importSvg(out).doc.texts!;assert.equal(back.find(t=>t.text==='Back')!.back,true);assert.equal(back.find(t=>t.text==='Hello')!.back,undefined);
 assert.equal(exportSvg(importSvg(out).doc),out);
 const W=(a:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text data-vs-text="1" ${a} x="5" y="5" font-family="Arial" font-size="12" fill="#000">hi</text></svg>`;
 assert.throws(()=>importSvg(W('data-vs-back="yes"')),SvgImportError);assert.equal(importSvg(W('data-vs-back="1"')).doc.texts![0].back,true);
 assert.equal(normalizeText({...T(),back:'x' as any})!.back,undefined);
 const dd=setup();await dd.runCommand('vector.addText',{x:5,y:5,back:true},o);const id=S.getVectorSession().textSel!;
 await dd.runCommand('vector.setText',{id,patch:{back:false}},o);assert.equal(S.getVectorSession().doc.texts![0].back,undefined);
 S.undo();assert.equal(S.getVectorSession().doc.texts![0].back,true);
});
