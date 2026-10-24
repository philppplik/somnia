import {registerCommandSpec} from '../commandBridge';
import {getSlidesSessionState} from '../slides/session';
import {getShapeSelection} from '../slides/shapeSelection';
import {readTable} from '../slides/deckPackage';
import {openSlidesTableInSheets,openSlidesPictureInPhotos} from './open';
/** CA2: palette entries for the handoff routes, enabled when the matching shape is selected. */
function selectedShape(kind:'table'|'picture'){
 try{
  const s=getSlidesSessionState(),sel=getShapeSelection();
  if(!sel||sel.source!==s.source||!s.source||s.slideIds[s.index]!==sel.slideId||s.presenting||!s.working||!s.model)return null;
  const shape=s.model.slides.find(x=>x.id===sel.slideId)?.shapes.find(x=>x.id===sel.shapeId&&x.parentId===null);
  return shape?.kind===kind?{s,slideId:sel.slideId,shape}:null;
 }catch{return null;}
}
export function registerHandoffCommands():()=>void{
 const offTable=registerCommandSpec({id:'slides.openTableInSheets',title:'Edit table in Sheets studio',category:'Edit',level:'ui',keywords:['handoff','sheets','table','spreadsheet'],enabled:()=>!!selectedShape('table'),run:async()=>{
  const ctx=selectedShape('table');if(!ctx)throw Error('Select a table first.');
  const info=readTable(ctx.s.working!,ctx.slideId,ctx.shape.id);
  if(!info.editable)throw Error('This table is read-only.');
  const r=await openSlidesTableInSheets({source:ctx.s.name,slideIndex:ctx.s.index,slideId:ctx.slideId,shapeId:ctx.shape.id,cells:info.cells});
  if(!r.ok)throw Error(r.message);
 }});
 const offPicture=registerCommandSpec({id:'slides.openPictureInPhotos',title:'Edit picture in Photos studio',category:'Edit',level:'ui',keywords:['handoff','photos','picture','image'],enabled:()=>!!selectedShape('picture'),run:async()=>{
  const ctx=selectedShape('picture');if(!ctx)throw Error('Select a picture first.');
  const r=await openSlidesPictureInPhotos({source:ctx.s.name,slideIndex:ctx.s.index,slideId:ctx.slideId,shapeId:ctx.shape.id,working:ctx.s.working!});
  if(!r.ok)throw Error(r.message);
 }});
 return()=>{offTable();offPicture();};
}
