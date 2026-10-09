import {addMediaFile,addBlankVideoProject,getMedia} from '../media';
import {addTextFiles,newBlankFile} from '../projectActions';
import {getState,patchState,requestStudio} from '../../store/appStore';
import {listStudios} from './registry';
import {blankDocx,blankXlsx,blankPptx,blankWav,blankName} from './blankFiles';

export type BlankProjectFactory=()=>void|Promise<void>;
const factories=new Map<string,BlankProjectFactory>();
/** Runtime studios with their own document store register a factory at module load. */
export function registerBlankProjectFactory(studioId:string,factory:BlankProjectFactory):()=>void{
 if(factories.has(studioId))throw Error(`Blank project factory already registered: ${studioId}`);
 factories.set(studioId,factory);return()=>{if(factories.get(studioId)===factory)factories.delete(studioId);};
}
const taken=()=>[...Object.keys(getState().files),...getMedia().items.map(i=>i.name)];
async function addBlank(bytes:Uint8Array,name:string){
 const result=await addMediaFile(new Blob([new Uint8Array(bytes)]),blankName(name,taken()));
 if('error' in result)throw Error(result.error);
}
const creating=new Map<string,Promise<void>>();
/** Creates an unsaved local project without opening a file picker. Errors reject, never silently succeed. */
export function createBlankProject(studioId:string):Promise<void>{
 const existing=creating.get(studioId);if(existing)return existing;
 const operation=(async()=>{
  const factory=factories.get(studioId);
  if(factory)await factory();
  else switch(studioId){
   case 'code':newBlankFile();break;
   case 'documents':await addBlank(blankDocx(),'Untitled.docx');break;
   case 'sheets':await addBlank(blankXlsx(),'Untitled.xlsx');break;
   case 'slides':await addBlank(blankPptx(),'Untitled.pptx');break;
   case 'sound':await addBlank(blankWav(),'Untitled.wav');break;
   case 'video':addBlankVideoProject(blankName('Untitled.video-project',taken()));break;
   case 'photos':case 'photo':{
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not create a blank photo.')),'image/png'));
    const result=await addMediaFile(blob,blankName('Untitled.png',taken()));if('error' in result)throw Error(result.error);break;
   }
   case 'vector':addTextFiles([{name:blankName('Untitled.svg',taken()),text:'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"></svg>'}]);break;
   case 'pdf':{
    const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([595.28,841.89]);await addBlank(await pdf.save(),'Untitled.pdf');break;
   }
   default:throw Error(`Blank project creation is not registered for ${studioId}.`);
  }
  if(listStudios().some(s=>s.id===studioId))requestStudio(studioId,'manual',false,getMedia().active?'media:'+getMedia().active:getState().activeFile);
  patchState({notice:'Created a blank project. Save or export a copy to keep it.'});
 })();
 creating.set(studioId,operation);void operation.finally(()=>creating.delete(studioId)).catch(()=>{});return operation;
}
