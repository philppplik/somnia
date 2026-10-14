import {t} from '../i18n';
import {getMedia,addMediaFile,setActiveMedia} from '../media';
import {blankName} from '../studios/blankFiles';
import {setHandoffOrigin} from './registry';
import {tableToXlsx} from './slidesTable';
import {readPicture} from '../slides/deckPackage';
/** CA2: opens a Slides object in its specialist studio, recording the origin for the round trip back. */
export type OpenResult={ok:true}|{ok:false;message:string};
export async function openSlidesTableInSheets(p:{source:string;slideIndex:number;slideId:number;shapeId:number;cells:readonly (readonly string[])[]}):Promise<OpenResult>{
 const taken=getMedia().items.map(i=>i.name);
 const name=blankName(`${p.source.replace(/\.pptx$/i,'')} - table.xlsx`,taken);
 const result=await addMediaFile(new Blob([tableToXlsx(p.cells,'Table 1')],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
 if('error' in result)return{ok:false,message:result.error};
 setHandoffOrigin(name,{studio:'slides',kind:'table',id:`${p.slideId}:${p.shapeId}`,label:t('handoff.tableLabel',{file:p.source,n:p.slideIndex+1}),file:p.source});
 setActiveMedia(name);return{ok:true};
}
export async function openSlidesPictureInPhotos(p:{source:string;slideIndex:number;slideId:number;shapeId:number;working:Uint8Array}):Promise<OpenResult>{
 try{
  const {data,ext}=readPicture(p.working,p.slideId,p.shapeId);
  const taken=getMedia().items.map(i=>i.name);
  const name=blankName(`${p.source.replace(/\.pptx$/i,'')} - picture.${ext}`,taken);
  const result=await addMediaFile(new Blob([data],{type:`image/${ext==='jpg'?'jpeg':ext}`}),name);
  if('error' in result)return{ok:false,message:result.error};
  setHandoffOrigin(name,{studio:'slides',kind:'picture',id:`${p.slideId}:${p.shapeId}`,label:t('handoff.pictureLabel',{file:p.source,n:p.slideIndex+1}),file:p.source});
  setActiveMedia(name);return{ok:true};
 }catch(e){return{ok:false,message:e instanceof Error?e.message:String(e)};}
}
