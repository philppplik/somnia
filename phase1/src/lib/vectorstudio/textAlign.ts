import {textBoxRotated,type VectorDocument} from '../vectorio';
import {selectionBounds} from './transforms';
import {ALIGN_MODES,type AlignMode} from './transforms';
/** Moves one text so its (measured or estimated, rotation-aware) box touches the chosen edge or centre of the page. Pure; the document is returned unchanged when the text is unknown. */
export function alignTextToPage(doc:VectorDocument,id:string,mode:AlignMode):VectorDocument{
 if(!ALIGN_MODES.includes(mode))throw new RangeError('Unknown align mode: '+String(mode));
 const t=(doc.texts??[]).find(x=>x.id===id);if(!t)throw new Error('Unknown text: '+id);
 const b=textBoxRotated(t);let dx=0,dy=0;
 switch(mode){
  case 'left':dx=-b.minX;break;case 'right':dx=doc.width-b.maxX;break;case 'centerX':dx=doc.width/2-(b.minX+b.maxX)/2;break;
  case 'top':dy=-b.minY;break;case 'bottom':dy=doc.height-b.maxY;break;case 'centerY':dy=doc.height/2-(b.minY+b.maxY)/2;break;}
 const r=(v:number)=>Math.round(v*1000)/1000;
 return {...doc,texts:(doc.texts??[]).map(x=>x.id===id?{...x,x:r(x.x+dx),y:r(x.y+dy)}:x)};
}

/** Box of an object other than the text itself: a path (with its compound and group), or another text. Null when unknown or empty. */
function objectBox(doc:VectorDocument,id:string){
 const t=(doc.texts??[]).find(x=>x.id===id);
 if(t){const b=textBoxRotated(t);return b;}
 const b=doc.paths.some(p=>p.id===id)?selectionBounds(doc,[id]):null;
 return b?{minX:b.x,minY:b.y,maxX:b.x+b.width,maxY:b.y+b.height}:null;
}
/** Moves one text so its box lines up with the matching edge or centre of another object's box (a path or another text). */
export function alignTextToObject(doc:VectorDocument,id:string,mode:AlignMode,targetId:string):VectorDocument{
 if(!ALIGN_MODES.includes(mode))throw new RangeError('Unknown align mode: '+String(mode));
 const t=(doc.texts??[]).find(x=>x.id===id);if(!t)throw new Error('Unknown text: '+id);
 if(targetId===id)throw new RangeError('A text cannot align to itself');
 const ref=objectBox(doc,targetId);if(!ref)throw new Error('Unknown object: '+targetId);
 const b=textBoxRotated(t);let dx=0,dy=0;
 switch(mode){
  case 'left':dx=ref.minX-b.minX;break;case 'right':dx=ref.maxX-b.maxX;break;case 'centerX':dx=(ref.minX+ref.maxX)/2-(b.minX+b.maxX)/2;break;
  case 'top':dy=ref.minY-b.minY;break;case 'bottom':dy=ref.maxY-b.maxY;break;case 'centerY':dy=(ref.minY+ref.maxY)/2-(b.minY+b.maxY)/2;break;}
 const r=(v:number)=>Math.round(v*1000)/1000;
 return {...doc,texts:(doc.texts??[]).map(x=>x.id===id?{...x,x:r(x.x+dx),y:r(x.y+dy)}:x)};
}
