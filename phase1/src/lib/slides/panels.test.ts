import test from 'node:test';
import {png} from './imageFixtures';
import {encodeBase64} from './imageSniff';
import assert from 'node:assert/strict';
import {CommandDispatcher} from '../commandDispatcher';
import {slidesPanelCommandSpecs,type PanelCommandDeps} from './panelCommands';
import {slidesPanels,slidesInspector} from './panelDefinitions';
import {SLIDES_PANEL_CATALOGUES} from './panelI18n';
import {deckMetrics,selectedRun,slideOutline,textIssue} from './panelModel';
const runs=[{slide:0,run:0,text:'Hello world',part:'ppt/slides/slide1.xml'},{slide:1,run:0,text:'Second slide',part:'ppt/slides/slide2.xml'}];
let picked:import('./shapeSelection').ShapeSelection|null=null;
function fixture(){picked=null;
 const state={source:'blob:deck1',index:0,busy:false,working:new Uint8Array(40),runs:runs.map(r=>({...r})),slideIds:[256,257],layouts:[{part:'ppt/slideLayouts/slideLayout1.xml',supported:true},{part:'ppt/slideLayouts/slideLayout2.xml',supported:false}],model:{slides:[{id:256,shapes:[{id:2,name:'A',kind:'text' as const,runCount:1,parentId:null,bounds:{x:1000000,y:1000000,w:2000000,h:1000000,rot:0,flipH:false,flipV:false,source:'slide' as const},ph:null},{id:3,name:'B',kind:'text' as const,runCount:1,parentId:null,bounds:null,ph:null}]},{id:257,shapes:[]},{id:258,shapes:[{id:5,name:'P',kind:'picture' as const,runCount:0,parentId:null,bounds:{x:1000000,y:1000000,w:2000000,h:1000000,rot:0,flipH:false,flipV:false,source:'slide' as const},ph:null}]}],slideSize:{cx:9144000,cy:6858000}},summary:{slides:2}};
 const calls:unknown[]=[];const deps:PanelCommandDeps={state:()=>state,theme:async edit=>{calls.push(['theme',edit]);},masterBox:async(id,expected,next)=>{calls.push(['masterBox',id,expected,next]);},thumbnails:async()=>{calls.push('thumbnails');},show:async index=>{state.index=index;calls.push(['show',index]);},edit:async(run,text)=>{state.runs=state.runs.map(r=>r.slide===run.slide&&r.run===run.run?{...r,text}:r);calls.push(['edit',text]);},select:v=>calls.push(v),move:async(id,to)=>{const a=state.slideIds.slice();a.splice(to,0,a.splice(a.indexOf(id),1)[0]);state.slideIds=a;calls.push(['move',id,to]);},duplicate:async id=>{calls.push(['dup',id]);},remove:async id=>{calls.push(['del',id]);},add:async(l,a)=>{calls.push(['add',l,a]);},setMany:async(id,edits)=>{calls.push(['many',id,edits]);},setTransition:async(id,tr)=>{calls.push(['transition',id,tr]);},insertTable:async(id,r,c)=>{calls.push(['insertTable',id,r,c]);},table:async(id,sid,edit)=>{calls.push(['table',id,sid,edit]);},style:async(id,ids,patch)=>{calls.push(['style',id,ids,patch]);},setNotes:async(id,lines)=>{calls.push(['notes',id,lines]);},group:async(id,ids)=>{calls.push(['group',id,ids]);},ungroup:async(id,sid)=>{calls.push(['ungroup',id,sid]);},arrange:async(id,ids,mode)=>{calls.push(['arrange',id,ids,mode]);},setBounds:async(id,sid,e,n)=>{calls.push(['bounds',id,sid,e,n]);},format:async(sid,id,f)=>{calls.push(['format',sid,id,f]);},addBox:async(sid,l)=>{calls.push(['addBox',sid,l]);},removeBox:async(sid,id)=>{calls.push(['removeBox',sid,id]);},insertImage:async(sid,img,alt)=>{calls.push(['insertImage',sid,img.length,alt]);},replaceImage:async(sid,id,img)=>{calls.push(['replaceImage',sid,id,img.length]);},removeImage:async(sid,id)=>{calls.push(['removeImage',sid,id]);},pick:v=>{picked=v;calls.push(['pick',v]);},picked:()=>picked};
 const dispatcher=new CommandDispatcher();slidesPanelCommandSpecs(deps).forEach(s=>dispatcher.register(s));return {state,calls,dispatcher};
}
test('outline searches text and slide number and preserves empty slides',()=>{
 assert.equal(slideOutline(runs,3).length,3);assert.equal(slideOutline(runs,3,'WORLD')[0].index,0);assert.equal(slideOutline(runs,3,'2')[0].index,1);assert.equal(slideOutline(runs,3,'missing').length,0);
});
test('selection cannot cross deck or slide identities',()=>{
 const s={source:'deck',index:0,runs};assert.equal(selectedRun(s,{source:'deck',slide:0,run:0})?.text,'Hello world');assert.equal(selectedRun(s,{source:'other',slide:0,run:0}),undefined);assert.equal(selectedRun(s,{source:'deck',slide:1,run:0}),undefined);
});
test('UTF-8 byte limit, surrogate pairs, and XML text restrictions',()=>{
 assert.equal(textIssue('a'.repeat(16384)),null);assert.equal(textIssue('é'.repeat(8193)),'size');assert.equal(textIssue('\u0000'),'characters');assert.equal(textIssue('\ud800'),'characters');assert.equal(textIssue('🔥\nText\t'),null);
});
test('metrics describe actual working bytes and text',()=>{
 assert.deepEqual(deckMetrics({summary:{slides:2,widthPt:100,heightPt:50},runs,working:new Uint8Array(40),wasmBytes:200}),{slides:2,runs:2,words:4,bytes:40,wasmBytes:200});
});
test('text selection navigates before selecting with stable source',async()=>{
 const f=fixture();await f.dispatcher.runCommand('slides.selectText',{source:'blob:deck1',slide:1,run:0,old:'Second slide'},{origin:'ui'});assert.equal(f.state.index,1);assert.deepEqual(f.calls[0],['show',1]);assert.deepEqual(f.calls[1],{source:'blob:deck1',slide:1,run:0});
});
test('edits validate schema, byte count, identity, old text and origins before mutation',async()=>{
 const f=fixture();const valid={source:'blob:deck1',slide:0,run:0,old:'Hello world',text:'Edited'};
 for(const p of [{...valid,source:'wrong'},{...valid,old:'stale'},{...valid,slide:1},{...valid,text:'é'.repeat(8193)},{...valid,text:'\u0000'},{...valid,run:-1},{...valid,extra:true}])await assert.rejects(f.dispatcher.runCommand('slides.editText',p,{origin:'ui'}));
 for(const origin of ['agent','mcp'] as const)await assert.rejects(f.dispatcher.runCommand('slides.editText',valid,{origin}));assert.equal(f.calls.length,0);
 await f.dispatcher.runCommand('slides.editText',valid,{origin:'ui'});assert.equal(f.state.runs[0].text,'Edited');assert.deepEqual(f.calls,[['edit','Edited']]);
});
test('busy and missing session disable every panel operation',async()=>{
 const f=fixture();f.state.busy=true;for(const spec of f.dispatcher.list())assert.equal(f.dispatcher.isEnabled(spec.id),false);f.state.busy=false;f.state.summary=null as never;for(const spec of f.dispatcher.list())assert.equal(f.dispatcher.isEnabled(spec.id),false);
});
test('thumbnail command uses session operation',async()=>{const f=fixture();await f.dispatcher.runCommand('slides.loadThumbnails',undefined,{origin:'ui'});assert.deepEqual(f.calls,['thumbnails']);});
test('every panel command and UI key exists in all five locales',()=>{
 const keys=Object.keys(SLIDES_PANEL_CATALOGUES.en).sort();for(const locale of ['en','de','es','fr','pt-BR'])assert.deepEqual(Object.keys(SLIDES_PANEL_CATALOGUES[locale]).sort(),keys);
 for(const p of slidesPanels){assert.equal(p.component,p.id==='inspector'?'shell.inspector':`slides.${p.id}`);assert.ok(SLIDES_PANEL_CATALOGUES.en[p.titleKey!]);}
 for(const id of ['loadThumbnails','selectText','editText','moveSlide','moveSlideEarlier','moveSlideLater','duplicateSlide','deleteSlide','newSlide','selectShape','selectNextShape','selectPreviousShape'])for(const locale of Object.keys(SLIDES_PANEL_CATALOGUES))assert.ok(SLIDES_PANEL_CATALOGUES[locale][`cmd.slides.${id}`]);
});

test('inspector section titles and commands are declared',()=>{
 for(const section of slidesInspector.sections){assert.equal(section.component,`slides.inspector.${section.id}`);assert.ok(SLIDES_PANEL_CATALOGUES.en[section.titleKey!]);}
 assert.deepEqual(slidesInspector.sections.map(s=>s.id),['text','deck','diagnostics']);
});

test('moveSlide validates identity, ranges and origins before mutating',async()=>{
 const f=fixture();const ok={source:'blob:deck1',slideId:257,toIndex:0};
 for(const p of [{...ok,source:'x'},{...ok,slideId:999},{...ok,toIndex:2},{...ok,toIndex:-1},{...ok,toIndex:0.5},{...ok,slideId:'257'},{...ok,extra:1},{source:'blob:deck1'}])await assert.rejects(f.dispatcher.runCommand('slides.moveSlide',p,{origin:'ui'}));
 for(const origin of ['agent','mcp'] as const)await assert.rejects(f.dispatcher.runCommand('slides.moveSlide',ok,{origin}));
 assert.equal(f.calls.length,0);
 await f.dispatcher.runCommand('slides.moveSlide',ok,{origin:'ui'});assert.deepEqual(f.calls,[['move',257,0]]);assert.deepEqual(f.state.slideIds,[257,256]);
});
test('earlier/later follow the viewed slide and stop at the edges',async()=>{
 const f=fixture();assert.equal(f.dispatcher.isEnabled('slides.moveSlideEarlier'),false);assert.equal(f.dispatcher.isEnabled('slides.moveSlideLater'),true);
 await f.dispatcher.runCommand('slides.moveSlideLater',undefined,{origin:'ui'});assert.deepEqual(f.calls,[['move',256,1]]);
 await assert.rejects(f.dispatcher.runCommand('slides.moveSlideEarlier',undefined,{origin:'ui'}));
 f.state.index=1;assert.equal(f.dispatcher.isEnabled('slides.moveSlideLater'),false);assert.equal(f.dispatcher.isEnabled('slides.moveSlideEarlier'),true);
});
test('reorder is disabled for non-canonical decks, single slides and busy sessions',()=>{
 const f=fixture();f.state.slideIds=[];assert.equal(f.dispatcher.isEnabled('slides.moveSlide'),false);
 f.state.slideIds=[256];f.state.summary={slides:1};assert.equal(f.dispatcher.isEnabled('slides.moveSlide'),false);
 f.state.slideIds=[256,257];f.state.summary={slides:2};f.state.busy=true;assert.equal(f.dispatcher.isEnabled('slides.moveSlide'),false);
});

test('duplicate, delete and new slide validate source, ids, layouts, limits and origins',async()=>{
 const f=fixture();const ok={source:'blob:deck1',slideId:257};
 for(const id of ['slides.duplicateSlide','slides.deleteSlide']){
  for(const p of [{...ok,source:'x'},{...ok,slideId:999},{...ok,slideId:1},{...ok,extra:1},{source:'blob:deck1'}])await assert.rejects(f.dispatcher.runCommand(id,p,{origin:'ui'}));
  for(const origin of ['agent','mcp'] as const)await assert.rejects(f.dispatcher.runCommand(id,ok,{origin}));
 }
 assert.equal(f.calls.length,0);
 await f.dispatcher.runCommand('slides.duplicateSlide',ok,{origin:'ui'});await f.dispatcher.runCommand('slides.deleteSlide',ok,{origin:'ui'});
 assert.deepEqual(f.calls,[['dup',257],['del',257]]);
 const good={source:'blob:deck1',layoutPart:'ppt/slideLayouts/slideLayout1.xml',afterSlideId:256};
 for(const p of [{...good,source:'x'},{...good,layoutPart:'ppt/slideLayouts/slideLayout2.xml'},{...good,layoutPart:'ppt/slideLayouts/slideLayout9.xml'},{...good,layoutPart:'../evil.xml'},{...good,afterSlideId:999},{...good,extra:1}])await assert.rejects(f.dispatcher.runCommand('slides.newSlide',p,{origin:'ui'}));
 await assert.rejects(f.dispatcher.runCommand('slides.newSlide',good,{origin:'agent'}));
 await f.dispatcher.runCommand('slides.newSlide',good,{origin:'ui'});await f.dispatcher.runCommand('slides.newSlide',{source:'blob:deck1',layoutPart:good.layoutPart},{origin:'ui'});
 assert.deepEqual(f.calls.slice(2),[['add','ppt/slideLayouts/slideLayout1.xml',256],['add','ppt/slideLayouts/slideLayout1.xml',null]]);
});
test('delete is disabled for a single slide; busy and unsupported-layout states disable new slide',()=>{
 const f=fixture();f.state.slideIds=[256];f.state.summary={slides:1};assert.equal(f.dispatcher.isEnabled('slides.deleteSlide'),false);assert.equal(f.dispatcher.isEnabled('slides.duplicateSlide'),true);
 f.state.layouts=[{part:'ppt/slideLayouts/slideLayout2.xml',supported:false}];assert.equal(f.dispatcher.isEnabled('slides.newSlide'),false);
 f.state.busy=true;for(const id of ['slides.duplicateSlide','slides.deleteSlide','slides.newSlide'])assert.equal(f.dispatcher.isEnabled(id),false);
});

test('selectShape validates source, slide, shape ids and origin; null clears',async()=>{
 const f=fixture();const ok={source:'blob:deck1',slideId:256,shapeId:2};
 for(const p of [{...ok,source:'x'},{...ok,slideId:257},{...ok,shapeId:99},{...ok,shapeId:-1},{...ok,shapeId:'2'},{...ok,extra:1},{source:'blob:deck1',slideId:256}])await assert.rejects(f.dispatcher.runCommand('slides.selectShape',p,{origin:'ui'}));
 await assert.rejects(f.dispatcher.runCommand('slides.selectShape',ok,{origin:'agent'}));assert.equal(f.calls.length,0);
 await f.dispatcher.runCommand('slides.selectShape',ok,{origin:'ui'});assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:2});
 await f.dispatcher.runCommand('slides.selectShape',{...ok,shapeId:null},{origin:'ui'});assert.equal(picked,null);
});
test('next/previous shape cycle in z-order, wrap, and are disabled without shapes',async()=>{
 const f=fixture();await f.dispatcher.runCommand('slides.selectNextShape',undefined,{origin:'ui'});assert.equal(picked!.shapeId,2);
 await f.dispatcher.runCommand('slides.selectNextShape',undefined,{origin:'ui'});assert.equal(picked!.shapeId,3);
 await f.dispatcher.runCommand('slides.selectNextShape',undefined,{origin:'ui'});assert.equal(picked!.shapeId,2);
 await f.dispatcher.runCommand('slides.selectPreviousShape',undefined,{origin:'ui'});assert.equal(picked!.shapeId,3);
 f.state.index=1;assert.equal(f.dispatcher.isEnabled('slides.selectNextShape'),false);
 f.state.index=0;f.state.busy=true;assert.equal(f.dispatcher.isEnabled('slides.selectShape'),false);
});

const BOX={x:1000000,y:1000000,w:2000000,h:1000000};
test('setShapeBounds validates identity, schema and shape kind before mutation',async()=>{
 const f=fixture(),run=(p:unknown)=>f.dispatcher.runCommand('slides.setShapeBounds',p,{origin:'ui'});
 const ok={source:'blob:deck1',slideId:256,shapeId:2,expected:BOX,next:{...BOX,x:1500000}};
 await run(ok);assert.deepEqual(f.calls.at(-1),['bounds',256,2,BOX,{...BOX,x:1500000}]);
 const n=f.calls.length;
 await assert.rejects(()=>run({...ok,source:'blob:other'}),/Slide changed/);
 await assert.rejects(()=>run({...ok,slideId:257}),/Slide changed/);
 await assert.rejects(()=>run({...ok,shapeId:3}),/cannot be moved or resized \(noBounds\)/);
 await assert.rejects(()=>run({...ok,shapeId:99}),/no longer exists/);
 await assert.rejects(()=>run({...ok,next:{...BOX,x:1.5}}));
 await assert.rejects(()=>run({...ok,next:{...BOX,extra:1}}));
 assert.equal(f.calls.length,n);
});
test('nudgeShape moves or resizes by whole points, clamps, and is a no-op at the limit',async()=>{
 const f=fixture(),nudge=(p:unknown)=>f.dispatcher.runCommand('slides.nudgeShape',p,{origin:'ui'});
 await assert.rejects(()=>nudge({mode:'move',dxPt:1,dyPt:0}),/Select a text box/);
 picked={source:'blob:deck1',slideId:256,shapeId:2};
 await nudge({mode:'move',dxPt:10,dyPt:-5});assert.deepEqual(f.calls.at(-1),['bounds',256,2,BOX,{...BOX,x:1127000,y:936500}]);
 await nudge({mode:'resize',dxPt:100,dyPt:100});assert.deepEqual((f.calls.at(-1) as unknown[])[4],{...BOX,w:3270000,h:2270000});
 await assert.rejects(()=>nudge({mode:'move',dxPt:1.5,dyPt:0}));
 await assert.rejects(()=>nudge({mode:'move',dxPt:101,dyPt:0}));
 picked={source:'blob:deck1',slideId:256,shapeId:3};
 await assert.rejects(()=>nudge({mode:'move',dxPt:1,dyPt:0}),/noBounds/);
});

test('formatText, addTextBox and removeTextBox validate identity and schema before mutation',async()=>{
 const f=fixture(),run=(id:string,p:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 await run('slides.formatText',{...base,shapeId:2,bold:true,sizePt:24,color:'c62828'});assert.deepEqual(f.calls.at(-1),['format',256,2,{bold:true,sizePt:24,color:'c62828'}]);
 const n=f.calls.length;
 await assert.rejects(()=>run('slides.formatText',{...base,shapeId:2}),/Choose a format/);
 await assert.rejects(()=>run('slides.formatText',{...base,shapeId:2,sizePt:5}));
 await assert.rejects(()=>run('slides.formatText',{...base,shapeId:2,color:'red'}));
 await assert.rejects(()=>run('slides.formatText',{...base,shapeId:2,font:'x'}));
 await assert.rejects(()=>run('slides.formatText',{...base,source:'x',shapeId:2,bold:true}),/Slide changed/);
 await assert.rejects(()=>run('slides.formatText',{...base,shapeId:99,bold:true}),/no longer exists/);
 await run('slides.addTextBox',{...base,text:'Hi'});assert.deepEqual(f.calls.at(-2),['addBox',256,'Hi']);assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:4});
 await assert.rejects(()=>run('slides.addTextBox',{...base,text:''}));await assert.rejects(()=>run('slides.addTextBox',{...base,text:'a\u0000'}),/unsupported/);await assert.rejects(()=>run('slides.addTextBox',{...base,slideId:257,source:'zzz',text:'x'}),/Slide changed/);
 picked={source:'blob:deck1',slideId:256,shapeId:2};
 await run('slides.removeTextBox',{...base,shapeId:2});assert.deepEqual(f.calls.at(-2),['removeBox',256,2]);assert.equal(picked,null);
 await assert.rejects(()=>run('slides.removeTextBox',{...base,shapeId:99}),/no longer exists/);
 assert.ok(f.calls.length>n);
});

test('image commands validate identity, bytes and shape kind before mutation',async()=>{
 const f=fixture(),run=(id:string,p:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256},img=png(40,30),data=encodeBase64(img);
 await run('slides.insertImage',{...base,name:'C:\\x\\My pic.png',data});assert.deepEqual(f.calls.at(-2),['insertImage',256,img.length,'My pic']);assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:4});
 const n=f.calls.length;
 await assert.rejects(()=>run('slides.insertImage',{...base,name:'a',data:encodeBase64(new Uint8Array(40))}),/Only PNG and JPEG/);
 await assert.rejects(()=>run('slides.insertImage',{...base,name:'a',data:'te!t'}),/not valid base64/);
 await assert.rejects(()=>run('slides.insertImage',{...base,name:'a',data:encodeBase64(png(0,5))}),/size could not/);
 await assert.rejects(()=>run('slides.insertImage',{...base,source:'x',name:'a',data}),/Slide changed/);
 await assert.rejects(()=>run('slides.insertImage',{...base,name:'a'}));
 await assert.rejects(()=>run('slides.replaceImage',{...base,shapeId:2,data}),/Select a picture/);
 await assert.rejects(()=>run('slides.removePicture',{...base,shapeId:2}),/Only pictures/);
 f.state.slideIds=[256,257,258];f.state.index=2;const b2={source:'blob:deck1',slideId:258};
 await run('slides.replaceImage',{...b2,shapeId:5,data});assert.deepEqual(f.calls.at(-1),['replaceImage',258,5,img.length]);
 await assert.rejects(()=>run('slides.replaceImage',{...b2,shapeId:99,data}),/no longer exists/);
 await assert.rejects(()=>run('slides.replaceImage',{...b2,shapeId:5,data:encodeBase64(new Uint8Array(3))}),/PNG or JPEG/);
 picked={source:'blob:deck1',slideId:258,shapeId:5};await run('slides.removePicture',{...b2,shapeId:5});assert.deepEqual(f.calls.at(-2),['removeImage',258,5]);assert.equal(picked,null);
 assert.ok(f.calls.length>n);
});

test('alignShape validates identity, mode and kind, aligns without resizing, and no-ops when already aligned',async()=>{
 const f=fixture(),run=(p:unknown)=>f.dispatcher.runCommand('slides.alignShape',p,{origin:'ui'}),size=f.state.model!.slideSize!;
 const ok={source:'blob:deck1',slideId:256,shapeId:2,mode:'left'};
 await run(ok);assert.deepEqual(f.calls.at(-1),['bounds',256,2,BOX,{...BOX,x:0}]);
 await run({...ok,mode:'center'});assert.deepEqual((f.calls.at(-1) as unknown[])[4],{...BOX,x:Math.round((size.cx-BOX.w)/2)});
 await run({...ok,mode:'bottom'});assert.deepEqual((f.calls.at(-1) as unknown[])[4],{...BOX,y:size.cy-BOX.h});
 const n=f.calls.length;
 await assert.rejects(()=>run({...ok,mode:'diagonal'}));
 await assert.rejects(()=>run({...ok,source:'blob:other'}),/Slide changed/);
 await assert.rejects(()=>run({...ok,shapeId:3}),/noBounds/);
 await assert.rejects(()=>run({...ok,shapeId:99}),/no longer exists/);
 assert.equal(f.calls.length,n);
});

test('multi-selection: toggle, select all, align to selection, distribute, and single-shape guards',async()=>{
 const f=fixture(),run=(id:string,p?:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 const bounds=(x:number,w:number)=>({x,y:1000000,w,h:1000000,rot:0,flipH:false,flipV:false,source:'slide' as const});
 const shapes=f.state.model!.slides[0].shapes as unknown[] as {id:number;name:string;kind:'text';runCount:number;parentId:null;bounds:ReturnType<typeof bounds>|null;ph:null}[];
 shapes.push({id:6,name:'C',kind:'text',runCount:1,parentId:null,bounds:bounds(5000000,1000000),ph:null},{id:7,name:'D',kind:'text',runCount:1,parentId:null,bounds:bounds(2000000,500000),ph:null});
 await run('slides.toggleShapeSelection',{...base,shapeId:2});assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:2});
 await run('slides.toggleShapeSelection',{...base,shapeId:6});await run('slides.toggleShapeSelection',{...base,shapeId:7});
 assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:2,more:[6,7]});
 await run('slides.toggleShapeSelection',{...base,shapeId:2});assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:6,more:[7]});
 await assert.rejects(()=>run('slides.toggleShapeSelection',{...base,shapeId:99}),/no longer exists/);
 await assert.rejects(()=>run('slides.toggleShapeSelection',{...base,slideId:257,shapeId:2}),/Slide changed/);
 f.calls.length=0;await run('slides.nudgeShape',{mode:'move',dxPt:10,dyPt:0});
 {const m=f.calls[0] as [string,number,{shapeId:number;next:{x:number}}[]];assert.equal(m[0],'many');assert.deepEqual(m[2].map(e=>[e.shapeId,e.next.x]),[[6,5127000],[7,2127000]]);}
 await assert.rejects(()=>run('slides.distributeSelection',{axis:'horizontal'}),/at least three/);
 await run('slides.selectAllShapes');assert.deepEqual(picked,{source:'blob:deck1',slideId:256,shapeId:2,more:[3,6,7]});
 await assert.rejects(()=>run('slides.alignSelection',{mode:'left',to:'selection'}),/cannot be moved \(noBounds\)/);
 picked={source:'blob:deck1',slideId:256,shapeId:2,more:[6,7]};f.calls.length=0;
 await run('slides.alignSelection',{mode:'left',to:'selection'});
 assert.deepEqual(f.calls,[['many',256,[{shapeId:6,expected:{x:5000000,y:1000000,w:1000000,h:1000000},next:{x:1000000,y:1000000,w:1000000,h:1000000}},{shapeId:7,expected:{x:2000000,y:1000000,w:500000,h:1000000},next:{x:1000000,y:1000000,w:500000,h:1000000}}]]]);
 f.calls.length=0;await run('slides.distributeSelection',{axis:'horizontal'});
 const many=f.calls[0] as [string,number,{shapeId:number;next:{x:number}}[]];assert.equal(many[0],'many');assert.deepEqual(many[2].map(e=>[e.shapeId,e.next.x]),[[7,3750000]]);
 f.calls.length=0;picked={source:'blob:deck1',slideId:256,shapeId:2,more:[7]};
 await run('slides.alignSelection',{mode:'top',to:'selection'});assert.equal(f.calls.length,0,'already aligned: no edit');
 await assert.rejects(()=>run('slides.alignSelection',{mode:'left',to:'nowhere'}));
 picked={source:'blob:deck1',slideId:256,shapeId:2};await assert.rejects(()=>run('slides.alignSelection',{mode:'left',to:'selection'}),/at least two/);
});

test('selectShapes (marquee) and arrangeShapes validate identity, ids, mode and cap before mutation',async()=>{
 const f=fixture(),run=(id:string,p?:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 await run('slides.selectShapes',{...base,shapeIds:[2,3]});assert.deepEqual(picked,{...base,shapeId:2,more:[3]});
 await run('slides.selectShapes',{...base,shapeIds:[2]});assert.deepEqual(picked,{...base,shapeId:2});
 picked={...base,shapeId:2};await run('slides.selectShapes',{...base,shapeIds:[3],add:true});assert.deepEqual(picked,{...base,shapeId:2,more:[3]});
 await run('slides.selectShapes',{...base,shapeIds:[]});assert.equal(picked,null);
 await assert.rejects(()=>run('slides.selectShapes',{...base,shapeIds:[2,99]}),/no longer exists/);
 await assert.rejects(()=>run('slides.selectShapes',{...base,slideId:257,shapeIds:[2]}),/Slide changed/);
 await assert.rejects(()=>run('slides.selectShapes',{...base,shapeIds:Array.from({length:51},(_,i)=>i)}));
 await assert.rejects(()=>run('slides.arrangeShapes',{mode:'front'}),/Select a shape first/);
 picked={...base,shapeId:2,more:[3]};f.calls.length=0;
 await run('slides.arrangeShapes',{mode:'front'});assert.deepEqual(f.calls,[['arrange',256,[2,3],'front']]);
 await assert.rejects(()=>run('slides.arrangeShapes',{mode:'sideways'}));
 picked={...base,shapeId:99};await assert.rejects(()=>run('slides.arrangeShapes',{mode:'back'}),/no longer exists/);
 assert.equal(f.calls.length,1);
});

test('transformSelection moves or scales the whole selection from its union box, with stale and range checks',async()=>{
 const f=fixture(),run=(p:unknown)=>f.dispatcher.runCommand('slides.transformSelection',p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 const b=(x:number,w:number)=>({x,y:1000000,w,h:1000000,rot:0,flipH:false,flipV:false,source:'slide' as const});
 (f.state.model!.slides[0].shapes as unknown[]).push({id:6,name:'C',kind:'text',runCount:1,parentId:null,bounds:b(5000000,1000000),ph:null});
 picked={...base,shapeId:2,more:[6]};
 const U={x:1000000,y:1000000,w:5000000,h:1000000};
 await assert.rejects(()=>run({expected:{...U,x:1},next:U}),/Selection changed/);
 await assert.rejects(()=>run({expected:U,next:{...U,w:10}}),/out of range/);
 await assert.rejects(()=>run({expected:U,next:{...U,x:99999999}}),/outside the slide/);
 f.calls.length=0;await run({expected:U,next:U});assert.equal(f.calls.length,0,'unchanged: no edit');
 await run({expected:U,next:{x:2000000,y:1500000,w:5000000,h:1000000}});
 assert.deepEqual((f.calls.at(-1) as unknown[])[2],[{shapeId:2,expected:{x:1000000,y:1000000,w:2000000,h:1000000},next:{x:2000000,y:1500000,w:2000000,h:1000000}},{shapeId:6,expected:{x:5000000,y:1000000,w:1000000,h:1000000},next:{x:6000000,y:1500000,w:1000000,h:1000000}}]);
 await run({expected:U,next:{x:1000000,y:1000000,w:2500000,h:500000}});
 assert.deepEqual(((f.calls.at(-1) as unknown[])[2] as {next:unknown}[]).map(e=>e.next),[{x:1000000,y:1000000,w:1000000,h:500000},{x:3000000,y:1000000,w:500000,h:500000}]);
});

test('setTransition validates identity and enums, defaults dir and speed',async()=>{
 const f=fixture(),run=(id:string,p?:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 await run('slides.setTransition',{...base,kind:'fade'});assert.deepEqual(f.calls,[['transition',256,{kind:'fade',dir:'l',speed:'med'}]]);
 await run('slides.setTransition',{...base,kind:'push',dir:'u',speed:'slow'});assert.deepEqual(f.calls.at(-1),['transition',256,{kind:'push',dir:'u',speed:'slow'}]);
 await assert.rejects(()=>run('slides.setTransition',{...base,kind:'spin'}));
 await assert.rejects(()=>run('slides.setTransition',{...base,kind:'fade',dir:'x'}));
 await assert.rejects(()=>run('slides.setTransition',{...base,slideId:999,kind:'fade'}),/no longer exists/);
 await assert.rejects(()=>run('slides.setTransition',{source:'blob:other',slideId:256,kind:'fade'}),/no longer exists/);
 await assert.rejects(()=>run('slides.setTransition',{...base,kind:'fade',extra:1}));
});

test('groupShapes and ungroupShape validate selection before mutation',async()=>{
 const f=fixture(),run=(id:string,p?:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 picked=null;await assert.rejects(()=>run('slides.groupShapes'),/at least two/);
 picked={...base,shapeId:2};await assert.rejects(()=>run('slides.groupShapes'),/at least two/);
 picked={...base,shapeId:2,more:[99]};await assert.rejects(()=>run('slides.groupShapes'),/no longer exists/);
 picked={...base,shapeId:2,more:[3]};await run('slides.groupShapes');assert.deepEqual(f.calls.at(-2),['group',256,[2,3]]);
 picked={...base,shapeId:2};await assert.rejects(()=>run('slides.ungroupShape'),/Select one group/);
 picked={...base,shapeId:2,more:[3]};await assert.rejects(()=>run('slides.ungroupShape'),/Select one group/);
 picked={...base,slideId:257,shapeId:2};await assert.rejects(()=>run('slides.ungroupShape'),/Select one group/);
 await assert.rejects(()=>run('slides.groupShapes',{x:1}));
});

test('setNotes validates identity and bounds before mutation',async()=>{
 const f=fixture(),run=(id:string,p?:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 await run('slides.setNotes',{...base,text:'a\r\nb\n\nc'});assert.deepEqual(f.calls.at(-1),['notes',256,['a','b','','c']]);
 await assert.rejects(()=>run('slides.setNotes',{...base,slideId:999,text:'x'}),/no longer exists/);
 await assert.rejects(()=>run('slides.setNotes',{source:'blob:other',slideId:256,text:'x'}),/no longer exists/);
 await assert.rejects(()=>run('slides.setNotes',{...base,text:'x'.repeat(20001)}));
 await assert.rejects(()=>run('slides.setNotes',{...base,text:Array.from({length:201},()=>'x').join('\n')}),/at most 200/);
 await assert.rejects(()=>run('slides.setNotes',{...base}));
});

test('styleShapes validates selection, kinds and values before mutation',async()=>{
 const f=fixture(),run=(id:string,p?:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 picked=null;await assert.rejects(()=>run('slides.styleShapes',{shadow:true}),/Select a shape first/);
 picked={...base,shapeId:2,more:[3]};
 await run('slides.styleShapes',{fill:{kind:'solid',color:'1F5FBF'},line:{kind:'solid',color:'000000'},shadow:true});
 assert.deepEqual(f.calls.at(-1),['style',256,[2,3],{fill:{kind:'solid',color:'1F5FBF',alpha:100},line:{kind:'solid',color:'000000',widthPt:1,dash:'solid'},shadow:true}]);
 await run('slides.styleShapes',{fill:{kind:'gradient',from:'1F2A5A',to:'1F5FBF',alpha:50}});assert.deepEqual((f.calls.at(-1) as unknown[])[3],{fill:{kind:'gradient',from:'1F2A5A',to:'1F5FBF',angle:90,alpha:50}});
 await assert.rejects(()=>run('slides.styleShapes',{}),/Nothing to change/);
 await assert.rejects(()=>run('slides.styleShapes',{fill:{kind:'solid'}}),/fill color/);
 await assert.rejects(()=>run('slides.styleShapes',{fill:{kind:'solid',color:'red'}}));
 await assert.rejects(()=>run('slides.styleShapes',{fill:{kind:'solid',color:'1F5FBF',alpha:1}}));
 await assert.rejects(()=>run('slides.styleShapes',{line:{kind:'solid',color:'000000',widthPt:99}}));
 await assert.rejects(()=>run('slides.styleShapes',{shadow:'yes'}));
 picked={...base,shapeId:2,more:[99]};await assert.rejects(()=>run('slides.styleShapes',{shadow:true}),/no longer exists/);
 picked={...base,slideId:258,shapeId:5};await assert.rejects(()=>run('slides.styleShapes',{shadow:true}),/Select a shape first/);
});

test('editTable validates identity, shape kind and edit parameters before mutation',async()=>{
 const f=fixture(),run=(p:unknown)=>f.dispatcher.runCommand('slides.editTable',p,{origin:'ui'});
 (f.state.model!.slides[0].shapes as unknown[]).push({id:9,name:'Table 8',kind:'table',runCount:0,parentId:null,bounds:null,ph:null});
 const base={source:'blob:deck1',slideId:256,shapeId:9};
 await run({...base,edit:{kind:'cell',row:1,col:2,text:'a\r\nb'}});assert.deepEqual(f.calls.at(-1),['table',256,9,{kind:'cell',row:1,col:2,text:'a\nb'}]);
 await run({...base,edit:{kind:'insertRow',at:2}});assert.deepEqual(f.calls.at(-1),['table',256,9,{kind:'insertRow',at:2}]);
 await run({...base,edit:{kind:'fill',scope:'row',row:0,col:0,color:'1F5FBF'}});assert.deepEqual((f.calls.at(-1) as unknown[])[3],{kind:'fill',scope:'row',row:0,col:0,fill:{kind:'solid',color:'1F5FBF'}});
 await run({...base,edit:{kind:'fill',scope:'table',row:0,col:0,none:true}});assert.deepEqual(((f.calls.at(-1) as unknown[])[3] as {fill:unknown}).fill,{kind:'none'});
 await run({...base,edit:{kind:'header',on:false}});
 const n=f.calls.length;
 await assert.rejects(()=>run({...base,shapeId:2,edit:{kind:'header',on:true}}),/Table no longer exists/);
 await assert.rejects(()=>run({...base,shapeId:77,edit:{kind:'header',on:true}}),/Table no longer exists/);
 await assert.rejects(()=>run({...base,slideId:257,edit:{kind:'header',on:true}}),/changed|no longer/);
 await assert.rejects(()=>run({...base,source:'blob:other',edit:{kind:'header',on:true}}),/changed/);
 await assert.rejects(()=>run({...base,edit:{kind:'cell',row:0,col:0}}),/missing text/);
 await assert.rejects(()=>run({...base,edit:{kind:'insertCol'}}),/missing at/);
 await assert.rejects(()=>run({...base,edit:{kind:'fill',scope:'cell',row:0,col:0}}),/fill color/);
 await assert.rejects(()=>run({...base,edit:{kind:'fill',scope:'cell',row:0,col:0,none:true,color:'000000'}}),/either/);
 await assert.rejects(()=>run({...base,edit:{kind:'fill',scope:'cell',row:0,col:0,color:'red'}}));
 await assert.rejects(()=>run({...base,edit:{kind:'cell',row:99,col:0,text:'x'}}));
 await assert.rejects(()=>run({...base,edit:{kind:'cell',row:0,col:0,text:'x'.repeat(2001)}}));
 await assert.rejects(()=>run({...base,edit:{kind:'melt'}}));
 await assert.rejects(()=>run({...base,edit:{kind:'header',on:true,extra:1}}));
 assert.equal(f.calls.length,n,'no mutation on rejected input');
});

test('insertTable and the new editTable kinds validate before mutation',async()=>{
 const f=fixture(),run=(id:string,p:unknown)=>f.dispatcher.runCommand(id,p,{origin:'ui'}),base={source:'blob:deck1',slideId:256};
 await run('slides.insertTable',{...base,rows:3,cols:4});assert.deepEqual(f.calls.at(-2),['insertTable',256,3,4]);assert.deepEqual(f.calls.at(-1),['pick',{source:'blob:deck1',slideId:256,shapeId:4}]);
 const n=f.calls.length;
 for(const bad of [{rows:0,cols:2},{rows:2,cols:21},{rows:51,cols:2},{rows:1.5,cols:2},{rows:2}])await assert.rejects(()=>run('slides.insertTable',{...base,...bad}));
 await assert.rejects(()=>run('slides.insertTable',{...base,slideId:257,rows:2,cols:2}),/changed/);
 await assert.rejects(()=>run('slides.insertTable',{...base,source:'blob:x',rows:2,cols:2}),/changed/);
 (f.state.model!.slides[0].shapes as unknown[]).push({id:9,name:'Table 8',kind:'table',runCount:0,parentId:null,bounds:null,ph:null});
 const t={...base,shapeId:9};
 await run('slides.editTable',{...t,edit:{kind:'merge',row:0,col:1,rowSpan:2,colSpan:2}});assert.deepEqual((f.calls.at(-1) as unknown[])[3],{kind:'merge',row:0,col:1,rowSpan:2,colSpan:2});
 await run('slides.editTable',{...t,edit:{kind:'split',row:0,col:1}});assert.deepEqual((f.calls.at(-1) as unknown[])[3],{kind:'split',row:0,col:1});
 await run('slides.editTable',{...t,edit:{kind:'rowHeight',at:1,heightPt:40.5}});assert.deepEqual((f.calls.at(-1) as unknown[])[3],{kind:'rowHeight',at:1,heightPt:40.5});
 await run('slides.editTable',{...t,edit:{kind:'colWidth',at:0,widthPt:120}});assert.deepEqual((f.calls.at(-1) as unknown[])[3],{kind:'colWidth',at:0,widthPt:120});
 const m=f.calls.length;
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'merge',row:0,col:0,rowSpan:2}}),/missing colSpan/);
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'merge',row:0,col:0,rowSpan:0,colSpan:2}}));
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'split',row:0}}),/missing col/);
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'rowHeight',at:0,heightPt:7}}));
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'rowHeight',at:0,heightPt:501}}));
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'colWidth',at:0,widthPt:19}}));
 await assert.rejects(()=>run('slides.editTable',{...t,edit:{kind:'colWidth',at:0}}),/missing widthPt/);
 assert.ok(n>0);assert.equal(f.calls.length,m);
});

test('editTheme validates deck identity, theme markup and bounded inputs before mutation',async()=>{
 const {readFileSync}=await import('node:fs'),{fileURLToPath}=await import('node:url');
 const f=fixture(),run=(p:unknown)=>f.dispatcher.runCommand('slides.editTheme',p,{origin:'ui'});
 await assert.rejects(()=>run({source:'blob:deck1',edit:{kind:'color',slot:'accent1',color:'112233'}}),/cannot be edited|exactly one|Cannot|zip|package/i);
 f.state.working=new Uint8Array(readFileSync(fileURLToPath(new URL('../../../slides-engine/fixtures/independent.pptx',import.meta.url))));
 await run({source:'blob:deck1',edit:{kind:'color',slot:'accent1',color:'112233'}});assert.deepEqual(f.calls.at(-1),['theme',{kind:'color',slot:'accent1',color:'112233'}]);
 await run({source:'blob:deck1',edit:{kind:'font',role:'major',name:'Georgia'}});assert.deepEqual(f.calls.at(-1),['theme',{kind:'font',role:'major',name:'Georgia'}]);
 const n=f.calls.length;
 await assert.rejects(()=>run({source:'blob:other',edit:{kind:'color',slot:'accent1',color:'112233'}}),/changed/);
 await assert.rejects(()=>run({source:'blob:deck1',edit:{kind:'color',slot:'accent1'}}),/Choose/);
 await assert.rejects(()=>run({source:'blob:deck1',edit:{kind:'color',slot:'accent1',color:'zzzzzz'}}));
 await assert.rejects(()=>run({source:'blob:deck1',edit:{kind:'font',role:'major',name:'<x>'}}),/unsupported/);
 await assert.rejects(()=>run({source:'blob:deck1',edit:{kind:'font',role:'major',name:'x'.repeat(65)}}));
 await assert.rejects(()=>run({source:'blob:deck1',edit:{kind:'bogus'}}));
 assert.equal(f.calls.length,n);
});
test('editMasterPlaceholder checks identity, placeholder and stale box before mutation',async()=>{
 const {readFileSync}=await import('node:fs'),{fileURLToPath}=await import('node:url');
 const f=fixture(),run=(p:unknown)=>f.dispatcher.runCommand('slides.editMasterPlaceholder',p,{origin:'ui'});
 f.state.working=new Uint8Array(readFileSync(fileURLToPath(new URL('../../../slides-engine/fixtures/independent.pptx',import.meta.url))));
 const box={x:457200,y:274638,w:8229600,h:1143000},next={...box,x:500000};
 await run({source:'blob:deck1',shapeId:2,expected:box,next});assert.deepEqual(f.calls.at(-1),['masterBox',2,box,next]);
 const n=f.calls.length;
 await assert.rejects(()=>run({source:'blob:other',shapeId:2,expected:box,next}),/changed/);
 await assert.rejects(()=>run({source:'blob:deck1',shapeId:77,expected:box,next}),/no longer exists/);
 await assert.rejects(()=>run({source:'blob:deck1',shapeId:2,expected:{...box,x:1},next}),/changed since/);
 await assert.rejects(()=>run({source:'blob:deck1',shapeId:2,expected:box,next:{...box,x:1.5}}));
 assert.equal(f.calls.length,n);
});
