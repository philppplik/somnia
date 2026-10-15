import {textBoxRotated,type VectorDocument} from '../vectorio';
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
