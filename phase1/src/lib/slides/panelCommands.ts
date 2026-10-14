import type {CommandSpec} from '../commandSpec';
import {registerCommandSpec} from '../commandBridge';
import {selectSlideText} from './panelSelection';
import {getSlidesSessionState,loadThumbnails,editSlideText,showSlide,moveSlideTo,duplicateSlideAt,deleteSlideAt,addSlideFromLayout,setShapeBoundsAt,setShapesBoundsAt,arrangeShapesAt,formatShapeAt,addTextBoxAt,removeTextBoxAt,insertPictureAt,replacePictureAt,removePictureAt} from './session';
import {textIssue} from './panelModel';
import type {TextRun} from './editCopy';
import './panelI18n';
import {selectShape,getShapeSelection,type ShapeSelection} from './shapeSelection';
import {stepShape,moveBox,resizeBox,resizeBoxAspect,boxOf,alignBox,alignBoxes,unionBox,transformGroup,distributeBoxes,ALIGN_MODES,type AlignMode} from './shapeGeometry';
import {sniffImage,altFromName,decodeBase64,MAX_IMAGE_BASE64} from './imageSniff';
import {boundsEditIssue,nextShapeId,MIN_SIZE_PT,MAX_SIZE_PT,MAX_SHAPES_PER_SLIDE,MAX_BOX_TEXT,MAX_MULTI_EDIT,ARRANGE_MODES,type ArrangeMode,type ShapeBoundsEdit,type RunFormat,type ShapeRef,type BoundsBox} from './deckPackage';
const MIN_GROUP_EMU=127000;
export interface PanelCommandDeps {
 state():{source:string;index:number;busy:boolean;working:Uint8Array|null;runs:TextRun[];slideIds:number[];layouts:{part:string;supported:boolean}[];model:{slides:{id:number;shapes:ShapeRef[]}[];slideSize:{cx:number;cy:number}|null}|null;summary:{slides:number}|null};
 thumbnails():Promise<void>;edit(run:TextRun,text:string):Promise<void>;show(index:number):Promise<void>;
 select(value:{source:string;slide:number;run:number}):void;move(slideId:number,toIndex:number):Promise<void>;duplicate(slideId:number):Promise<void>;remove(slideId:number):Promise<void>;add(layoutPart:string,afterSlideId:number|null):Promise<void>;setBounds(slideId:number,shapeId:number,expected:BoundsBox,next:BoundsBox):Promise<void>;setMany(slideId:number,edits:ShapeBoundsEdit[]):Promise<void>;arrange(slideId:number,shapeIds:number[],mode:ArrangeMode):Promise<void>;format(slideId:number,shapeId:number,f:RunFormat):Promise<void>;addBox(slideId:number,label:string):Promise<void>;removeBox(slideId:number,shapeId:number):Promise<void>;insertImage(slideId:number,image:Uint8Array,alt:string):Promise<void>;replaceImage(slideId:number,shapeId:number,image:Uint8Array):Promise<void>;removeImage(slideId:number,shapeId:number):Promise<void>;pick(value:ShapeSelection|null):void;picked():ShapeSelection|null;
}
const identity={source:{type:'string',minLength:1},slide:{type:'integer',minimum:0},run:{type:'integer',minimum:0},old:{type:'string'}};
export function slidesPanelCommandSpecs(d:PanelCommandDeps):CommandSpec[]{
 const available=()=>{const s=d.state();return !!s.working&&!!s.summary&&!s.busy;};
 const reorderable=()=>{const s=d.state();return available()&&s.slideIds.length>1&&s.slideIds.length===s.summary!.slides;};
 const slideId={type:'integer',minimum:256,maximum:2147483647} as const;
 const coord={type:'integer',minimum:-10000000000,maximum:10000000000} as const,box={type:'object',properties:{x:coord,y:coord,w:coord,h:coord},required:['x','y','w','h'],additionalProperties:false} as const;
 const shapesOf=()=>{const s=d.state(),id=s.slideIds[s.index];return s.model?.slides.find(x=>x.id===id)?.shapes??[];};

 /** The current multi-selection on this slide, in selection order (primary first). Throws when stale. */
 const selectedShapes=()=>{
  const s=d.state(),pick=d.picked();
  if(!pick||pick.source!==s.source||s.slideIds[s.index]!==pick.slideId)throw expected('Select a shape first.');
  const slide=s.model?.slides.find(x=>x.id===pick.slideId),size=s.model?.slideSize;
  if(!slide||!size)throw expected('Shape no longer exists.');
  const shapes=[pick.shapeId,...(pick.more??[])].map(id=>slide.shapes.find(x=>x.id===id&&x.parentId===null));
  if(shapes.some(x=>!x))throw expected('A selected shape no longer exists.');
  for(const sh of shapes as ShapeRef[]){const issue=boundsEditIssue(sh);if(issue)throw expected(`A selected shape cannot be moved (${issue}).`);}
  return {slideId:pick.slideId,shapes:shapes as ShapeRef[],size};
 };
 const applyBoxes=async(slideId:number,shapes:ShapeRef[],next:{x:number;y:number;w:number;h:number}[])=>{
  const edits:ShapeBoundsEdit[]=[];
  shapes.forEach((sh,i)=>{const from=boxOf(sh.bounds!),n=next[i];if(n.x!==from.x||n.y!==from.y||n.w!==from.w||n.h!==from.h)edits.push({shapeId:sh.id,expected:from,next:n});});
  if(edits.length)await d.setMany(slideId,edits);
 };
 const cycle=(delta:1|-1)=>{const s=d.state(),id=s.slideIds[s.index],cur=d.picked();const next=stepShape(shapesOf(),cur&&cur.source===s.source&&cur.slideId===id?cur.shapeId:null,delta);if(next)d.pick({source:s.source,slideId:id,shapeId:next.id});};
 const expected=(m:string)=>Object.assign(new Error(m),{expected:true});
 const imageBytes=(v:unknown)=>{try{const b=decodeBase64(v as string);sniffImage(b);return b;}catch(e){throw expected(String((e as Error).message));}};
 const step=async(delta:number)=>{const s=d.state(),to=s.index+delta;if(to<0||to>=s.slideIds.length)throw expected('The slide is already at the edge of the deck.');await d.move(s.slideIds[s.index],to);};
 return [
  {id:'slides.loadThumbnails',title:'Load slide thumbnails',category:'View',level:'ui',enabled:available,run:()=>d.thumbnails()},
  {id:'slides.selectText',title:'Select slide text',category:'View',level:'ui',enabled:available,params:{type:'object',properties:identity,required:['source','slide','run','old'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string};let s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||!r||r.text!==v.old)throw Error('Text selection is stale.');
   if(s.index!==v.slide)await d.show(v.slide);s=d.state();if(s.source!==v.source||s.index!==v.slide||s.busy||s.runs.find(r=>r.slide===v.slide&&r.run===v.run)?.text!==v.old)throw Error('Slide navigation did not complete.');
   d.select({source:v.source,slide:v.slide,run:v.run});
  }},
  {id:'slides.moveSlide',title:'Move slide',category:'Edit',level:'ui',keywords:['reorder','slide','drag','position'],enabled:reorderable,params:{type:'object',properties:{source:identity.source,slideId:{type:'integer',minimum:256,maximum:2147483647},toIndex:{type:'integer',minimum:0,maximum:199}},required:['source','slideId','toIndex'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;toIndex:number};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');
   if(!s.slideIds.includes(v.slideId))throw expected('Slide no longer exists. Reselect the slide.');
   if(v.toIndex>=s.slideIds.length)throw expected(`Target position ${v.toIndex+1} is outside this ${s.slideIds.length}-slide deck.`);
   await d.move(v.slideId,v.toIndex);
  }},
  {id:'slides.moveSlideEarlier',title:'Move slide earlier',category:'Edit',level:'ui',keywords:['reorder','up','before'],enabled:()=>reorderable()&&d.state().index>0,run:()=>step(-1)},
  {id:'slides.moveSlideLater',title:'Move slide later',category:'Edit',level:'ui',keywords:['reorder','down','after'],enabled:()=>reorderable()&&d.state().index<d.state().slideIds.length-1,run:()=>step(1)},
  {id:'slides.duplicateSlide',title:'Duplicate slide',category:'Edit',level:'ui',keywords:['copy','clone','slide'],enabled:()=>reorderable()||(available()&&d.state().slideIds.length===1),params:{type:'object',properties:{source:identity.source,slideId:slideId},required:['source','slideId'],additionalProperties:false},run:async p=>{const v=p as {source:string;slideId:number};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');if(!s.slideIds.includes(v.slideId))throw expected('Slide no longer exists. Reselect the slide.');if(s.slideIds.length>=200)throw expected('A deck can hold at most 200 slides.');await d.duplicate(v.slideId);}},
  {id:'slides.deleteSlide',title:'Delete slide',category:'Edit',level:'ui',keywords:['remove','slide'],enabled:()=>available()&&d.state().slideIds.length>1,params:{type:'object',properties:{source:identity.source,slideId:slideId},required:['source','slideId'],additionalProperties:false},run:async p=>{const v=p as {source:string;slideId:number};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');if(!s.slideIds.includes(v.slideId))throw expected('Slide no longer exists. Reselect the slide.');if(s.slideIds.length<=1)throw expected('A presentation needs at least one slide.');await d.remove(v.slideId);}},
  {id:'slides.newSlide',title:'New slide from layout',category:'Edit',level:'ui',keywords:['add','insert','layout','slide'],enabled:()=>available()&&d.state().slideIds.length>0&&d.state().layouts.some(l=>l.supported),params:{type:'object',properties:{source:identity.source,layoutPart:{type:'string',pattern:'^ppt/slideLayouts/slideLayout[0-9]+\\.xml$'},afterSlideId:{type:['integer','null'],minimum:256,maximum:2147483647}},required:['source','layoutPart'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;layoutPart:string;afterSlideId?:number|null};const s=d.state();
   if(s.source!==v.source)throw expected('Deck changed since selection.');const layout=s.layouts.find(l=>l.part===v.layoutPart);
   if(!layout)throw expected('Layout no longer exists.');if(!layout.supported)throw expected('This layout has placeholders new slides cannot create yet.');
   if(v.afterSlideId!=null&&!s.slideIds.includes(v.afterSlideId))throw expected('Slide no longer exists. Reselect the slide.');if(s.slideIds.length>=200)throw expected('A deck can hold at most 200 slides.');
   await d.add(v.layoutPart,v.afterSlideId??null);}},
  {id:'slides.selectShape',title:'Select shape',category:'View',level:'ui',keywords:['shape','object','select'],enabled:()=>{const s=d.state();return available()&&!!s.model&&s.slideIds.length>0;},params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:['integer','null'],minimum:0,maximum:2147483647}},required:['source','slideId','shapeId'],additionalProperties:false},run:p=>{
   const v=p as {source:string;slideId:number;shapeId:number|null};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   if(v.shapeId===null){d.pick(null);return;}
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   d.pick({source:v.source,slideId:v.slideId,shapeId:v.shapeId});}},
  {id:'slides.setShapeBounds',title:'Move or resize text box',category:'Edit',level:'ui',keywords:['shape','text box','move','resize','position','size'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647},expected:box,next:box},required:['source','slideId','shapeId','expected','next'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;shapeId:number;expected:BoundsBox;next:BoundsBox};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape)throw expected('Shape no longer exists.');
   const issue=boundsEditIssue(shape);if(issue)throw expected(`This shape cannot be moved or resized (${issue}).`);
   await d.setBounds(v.slideId,v.shapeId,v.expected,v.next);}},
  {id:'slides.toggleShapeSelection',title:'Add or remove shape from selection',category:'View',level:'ui',keywords:['shape','object','select','multiple','shift'],enabled:()=>{const s=d.state();return available()&&!!s.model&&s.slideIds.length>0;},params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647}},required:['source','slideId','shapeId'],additionalProperties:false},run:p=>{
   const v=p as {source:string;slideId:number;shapeId:number};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   const cur=d.picked(),ids=cur&&cur.source===v.source&&cur.slideId===v.slideId?[cur.shapeId,...(cur.more??[])]:[];
   const next=ids.includes(v.shapeId)?ids.filter(i=>i!==v.shapeId):[...ids,v.shapeId];
   if(next.length>MAX_MULTI_EDIT)throw expected(`Select at most ${MAX_MULTI_EDIT} shapes.`);
   d.pick(next.length?{source:v.source,slideId:v.slideId,shapeId:next[0],...(next.length>1?{more:next.slice(1)}:{})}:null);}},
  {id:'slides.selectAllShapes',title:'Select all shapes',category:'View',level:'ui',keywords:['shape','object','select','all'],enabled:()=>{const s=d.state();return available()&&shapesOf().some(x=>x.parentId===null);},run:()=>{
   const s=d.state(),id=s.slideIds[s.index],ids=shapesOf().filter(x=>x.parentId===null).map(x=>x.id);
   if(!ids.length)throw expected('This slide has no shapes.');if(ids.length>MAX_MULTI_EDIT)throw expected(`Select at most ${MAX_MULTI_EDIT} shapes.`);
   d.pick({source:s.source,slideId:id,shapeId:ids[0],...(ids.length>1?{more:ids.slice(1)}:{})});}},
  {id:'slides.transformSelection',title:'Move or resize selected shapes together',category:'Edit',level:'ui',keywords:['move','resize','scale','group','selection','shapes','together'],enabled:available,params:{type:'object',properties:{expected:box,next:box},required:['expected','next'],additionalProperties:false},run:async p=>{
   const v=p as {expected:BoundsBox;next:BoundsBox},{slideId:sid,shapes,size}=selectedShapes(),boxes=shapes.map(x=>boxOf(x.bounds!)),from=unionBox(boxes);
   if(from.x!==v.expected.x||from.y!==v.expected.y||from.w!==v.expected.w||from.h!==v.expected.h)throw expected('Selection changed since it was drawn.');
   const n=v.next;if(n.w<MIN_GROUP_EMU||n.h<MIN_GROUP_EMU||n.w>size.cx*2||n.h>size.cy*2)throw expected('Size is out of range.');
   if(n.x<-n.w||n.y<-n.h||n.x>size.cx||n.y>size.cy)throw expected('Position is outside the slide.');
   if(shapes.some(x=>x.kind==='picture')&&Math.abs(n.w*from.h-n.h*from.w)>Math.max(from.w,from.h)*2)throw expected('Pictures keep their aspect ratio.');
   await applyBoxes(sid,shapes,transformGroup(boxes,from,n));}},
  {id:'slides.alignSelection',title:'Align selected shapes',category:'Edit',level:'ui',keywords:['align','left','right','center','top','middle','bottom','selection','shapes'],enabled:available,params:{type:'object',properties:{mode:{enum:[...ALIGN_MODES]},to:{enum:['slide','selection']}},required:['mode','to'],additionalProperties:false},run:async p=>{
   const v=p as {mode:AlignMode;to:'slide'|'selection'},{slideId:sid,shapes,size}=selectedShapes(),boxes=shapes.map(x=>boxOf(x.bounds!));
   if(v.to==='selection'&&shapes.length<2)throw expected('Select at least two shapes to align them to each other.');
   await applyBoxes(sid,shapes,v.to==='slide'?boxes.map(b=>alignBox(b,v.mode,size)):alignBoxes(boxes,v.mode));}},
  {id:'slides.distributeSelection',title:'Distribute selected shapes evenly',category:'Edit',level:'ui',keywords:['distribute','space','evenly','horizontal','vertical','selection','shapes'],enabled:available,params:{type:'object',properties:{axis:{enum:['horizontal','vertical']}},required:['axis'],additionalProperties:false},run:async p=>{
   const v=p as {axis:'horizontal'|'vertical'},{slideId:sid,shapes}=selectedShapes();
   if(shapes.length<3)throw expected('Select at least three shapes to distribute them.');
   await applyBoxes(sid,shapes,distributeBoxes(shapes.map(x=>boxOf(x.bounds!)),v.axis));}},
  {id:'slides.selectShapes',title:'Select shapes',category:'View',level:'ui',keywords:['shape','object','select','marquee','multiple'],enabled:()=>{const s=d.state();return available()&&!!s.model&&s.slideIds.length>0;},params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeIds:{type:'array',maxItems:MAX_MULTI_EDIT,items:{type:'integer',minimum:0,maximum:2147483647}},add:{type:'boolean'}},required:['source','slideId','shapeIds'],additionalProperties:false},run:p=>{
   const v=p as {source:string;slideId:number;shapeIds:number[];add?:boolean};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const slide=s.model?.slides.find(x=>x.id===v.slideId);if(!slide)throw expected('Slide no longer exists.');
   const cur=d.picked(),have=v.add&&cur&&cur.source===v.source&&cur.slideId===v.slideId?[cur.shapeId,...(cur.more??[])]:[];
   const ids=[...new Set([...have,...v.shapeIds])];
   for(const id of ids)if(!slide.shapes.some(x=>x.id===id&&x.parentId===null))throw expected('Shape no longer exists.');
   if(ids.length>MAX_MULTI_EDIT)throw expected(`Select at most ${MAX_MULTI_EDIT} shapes.`);
   d.pick(ids.length?{source:v.source,slideId:v.slideId,shapeId:ids[0],...(ids.length>1?{more:ids.slice(1)}:{})}:null);}},
  {id:'slides.arrangeShapes',title:'Arrange selected shapes',category:'Edit',level:'ui',keywords:['arrange','order','front','back','forward','backward','z-order','layer','stack'],enabled:available,params:{type:'object',properties:{mode:{enum:[...ARRANGE_MODES]}},required:['mode'],additionalProperties:false},run:async p=>{
   const v=p as {mode:ArrangeMode},s=d.state(),pick=d.picked();
   if(!pick||pick.source!==s.source||s.slideIds[s.index]!==pick.slideId)throw expected('Select a shape first.');
   const slide=s.model?.slides.find(x=>x.id===pick.slideId);if(!slide)throw expected('Slide no longer exists.');
   const ids=[pick.shapeId,...(pick.more??[])];
   for(const id of ids)if(!slide.shapes.some(x=>x.id===id&&x.parentId===null))throw expected('A selected shape no longer exists.');
   await d.arrange(pick.slideId,ids,v.mode);}},
  {id:'slides.alignShape',title:'Align shape to slide',category:'Edit',level:'ui',keywords:['align','left','right','center','top','middle','bottom','shape','picture','position'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647},mode:{enum:[...ALIGN_MODES]}},required:['source','slideId','shapeId','mode'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;shapeId:number;mode:AlignMode};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId),size=s.model?.slideSize;
   if(!shape||!size)throw expected('Shape no longer exists.');
   const issue=boundsEditIssue(shape);if(issue)throw expected(`This shape cannot be moved (${issue}).`);
   const from=boxOf(shape.bounds!),next=alignBox(from,v.mode,size);
   if(next.x===from.x&&next.y===from.y)return;
   await d.setBounds(v.slideId,v.shapeId,from,next);}},
  {id:'slides.nudgeShape',title:'Nudge selected text box',category:'Edit',level:'ui',keywords:['shape','text box','nudge','move','resize','arrow'],enabled:available,params:{type:'object',properties:{mode:{enum:['move','resize']},dxPt:{type:'integer',minimum:-100,maximum:100},dyPt:{type:'integer',minimum:-100,maximum:100}},required:['mode','dxPt','dyPt'],additionalProperties:false},run:async p=>{
   const v=p as {mode:'move'|'resize';dxPt:number;dyPt:number};const s=d.state(),pick=d.picked();
   if(!pick||pick.source!==s.source||s.slideIds[s.index]!==pick.slideId)throw expected('Select a text box first.');
   if(pick.more?.length){
    const {slideId:sid,shapes,size:sz}=selectedShapes(),boxes=shapes.map(x=>boxOf(x.bounds!)),from=unionBox(boxes),dxe=v.dxPt*12700,dye=v.dyPt*12700;
    const to=v.mode==='move'?moveBox(from,dxe,dye,sz):(shapes.some(x=>x.kind==='picture')?resizeBoxAspect:resizeBox)(from,'se',dxe,dye,sz);
    await applyBoxes(sid,shapes,transformGroup(boxes,from,to));return;}
   const slide=s.model?.slides.find(x=>x.id===pick.slideId),shape=slide?.shapes.find(x=>x.id===pick.shapeId),size=s.model?.slideSize;
   if(!shape||!size)throw expected('Shape no longer exists.');
   const issue=boundsEditIssue(shape);if(issue)throw expected(`This shape cannot be moved or resized (${issue}).`);
   const from=boxOf(shape.bounds!),dx=v.dxPt*12700,dy=v.dyPt*12700;
   const next=v.mode==='move'?moveBox(from,dx,dy,size):(shape.kind==='picture'?resizeBoxAspect:resizeBox)(from,'se',dx,dy,size);
   if(next.x===from.x&&next.y===from.y&&next.w===from.w&&next.h===from.h)return;
   await d.setBounds(pick.slideId,pick.shapeId,from,next);}},
  {id:'slides.formatText',title:'Format text box text',category:'Edit',level:'ui',keywords:['bold','italic','size','color','font','format','text'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647},bold:{type:'boolean'},italic:{type:'boolean'},sizePt:{type:'integer',minimum:MIN_SIZE_PT,maximum:MAX_SIZE_PT},color:{type:'string',pattern:'^[0-9A-Fa-f]{6}$'}},required:['source','slideId','shapeId'],additionalProperties:false},run:async p=>{
   const {source,slideId:sid,shapeId,...f}=p as {source:string;slideId:number;shapeId:number}&RunFormat;const s=d.state();
   if(!Object.keys(f).length)throw expected('Choose a format to apply.');
   if(s.source!==source||s.slideIds[s.index]!==sid)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===sid)?.shapes.find(x=>x.id===shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   if(shape.kind!=='text'||shape.runCount===0)throw expected('Only text boxes with text can be formatted.');
   await d.format(sid,shapeId,f);}},
  {id:'slides.addTextBox',title:'Add text box',category:'Edit',level:'ui',keywords:['text box','add','insert','text'],enabled:()=>available()&&!!d.state().model?.slideSize,params:{type:'object',properties:{source:identity.source,slideId:slideId,text:{type:'string',minLength:1,maxLength:MAX_BOX_TEXT}},required:['source','slideId','text'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;text:string};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const slide=s.model?.slides.find(x=>x.id===v.slideId);if(!slide)throw expected('Slide no longer exists.');
   if(slide.shapes.length>=MAX_SHAPES_PER_SLIDE)throw expected(`A slide can hold at most ${MAX_SHAPES_PER_SLIDE} shapes.`);
   if(textIssue(v.text))throw expected('Text contains unsupported characters.');
   const id=nextShapeId(slide);await d.addBox(v.slideId,v.text);d.pick({source:v.source,slideId:v.slideId,shapeId:id});}},
  {id:'slides.removeTextBox',title:'Remove text box',category:'Edit',level:'ui',keywords:['text box','remove','delete'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647}},required:['source','slideId','shapeId'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;shapeId:number};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   if(shape.kind!=='text')throw expected('Only text boxes can be removed.');
   await d.removeBox(v.slideId,v.shapeId);d.pick(null);}},
  {id:'slides.insertImage',title:'Insert image',category:'Edit',level:'ui',keywords:['image','picture','photo','insert','png','jpeg'],enabled:()=>available()&&!!d.state().model?.slideSize,params:{type:'object',properties:{source:identity.source,slideId:slideId,name:{type:'string',maxLength:512},data:{type:'string',minLength:4,maxLength:MAX_IMAGE_BASE64}},required:['source','slideId','name','data'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;name:string;data:string};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const slide=s.model?.slides.find(x=>x.id===v.slideId);if(!slide)throw expected('Slide no longer exists.');
   if(slide.shapes.length>=MAX_SHAPES_PER_SLIDE)throw expected(`A slide can hold at most ${MAX_SHAPES_PER_SLIDE} shapes.`);
   const image=imageBytes(v.data);await d.insertImage(v.slideId,image,altFromName(v.name));
   d.pick({source:v.source,slideId:v.slideId,shapeId:nextShapeId(slide)});}},
  {id:'slides.replaceImage',title:'Replace image',category:'Edit',level:'ui',keywords:['image','picture','photo','replace','swap'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647},data:{type:'string',minLength:4,maxLength:MAX_IMAGE_BASE64}},required:['source','slideId','shapeId','data'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;shapeId:number;data:string};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   if(shape.kind!=='picture')throw expected('Select a picture to replace.');
   await d.replaceImage(v.slideId,v.shapeId,imageBytes(v.data));}},
  {id:'slides.removePicture',title:'Remove picture',category:'Edit',level:'ui',keywords:['image','picture','remove','delete'],enabled:available,params:{type:'object',properties:{source:identity.source,slideId:slideId,shapeId:{type:'integer',minimum:0,maximum:2147483647}},required:['source','slideId','shapeId'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slideId:number;shapeId:number};const s=d.state();
   if(s.source!==v.source||s.slideIds[s.index]!==v.slideId)throw expected('Slide changed since selection.');
   const shape=s.model?.slides.find(x=>x.id===v.slideId)?.shapes.find(x=>x.id===v.shapeId);
   if(!shape||shape.parentId!==null)throw expected('Shape no longer exists.');
   if(shape.kind!=='picture')throw expected('Only pictures can be removed here.');
   await d.removeImage(v.slideId,v.shapeId);d.pick(null);}},
  {id:'slides.selectNextShape',title:'Select next shape',category:'View',level:'ui',keywords:['shape','object','tab','next'],enabled:()=>available()&&shapesOf().length>0,run:()=>cycle(1)},
  {id:'slides.selectPreviousShape',title:'Select previous shape',category:'View',level:'ui',keywords:['shape','object','previous'],enabled:()=>available()&&shapesOf().length>0,run:()=>cycle(-1)},
  {id:'slides.editText',title:'Apply slide text',category:'Edit',level:'ui',enabled:available,allowInInput:true,params:{type:'object',properties:{...identity,text:{type:'string',maxLength:16384}},required:['source','slide','run','old','text'],additionalProperties:false},run:async p=>{
   const v=p as {source:string;slide:number;run:number;old:string;text:string};const s=d.state();const r=s.runs.find(r=>r.slide===v.slide&&r.run===v.run);
   if(s.source!==v.source||s.index!==v.slide||!r||r.text!==v.old)throw Error('Text changed since selection.');
   if(textIssue(v.text))throw Error('Text contains unsupported characters or exceeds 16 KiB.');
   await d.edit(r,v.text);const after=d.state();if(after.source!==v.source||after.runs.find(x=>x.slide===v.slide&&x.run===v.run)?.text!==v.text)throw Error('Text edit did not complete.');
  }},
 ];
}
const deps:PanelCommandDeps={state:getSlidesSessionState,thumbnails:loadThumbnails,edit:editSlideText,show:showSlide,select:selectSlideText,move:moveSlideTo,duplicate:duplicateSlideAt,remove:deleteSlideAt,add:addSlideFromLayout,setBounds:setShapeBoundsAt,setMany:setShapesBoundsAt,arrange:arrangeShapesAt,format:formatShapeAt,addBox:addTextBoxAt,removeBox:removeTextBoxAt,insertImage:insertPictureAt,replaceImage:replacePictureAt,removeImage:removePictureAt,pick:selectShape,picked:getShapeSelection};
export function registerSlidesPanelCommands(){const offs=slidesPanelCommandSpecs(deps).map(s=>registerCommandSpec(s));return()=>offs.forEach(off=>off());}
