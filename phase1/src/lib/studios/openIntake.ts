import {prepareMediaFile} from '../media';
import {commitTextFiles,installOpenIncoming,type IncomingFile} from '../projectActions';
import {decodeFileBytes} from '../textEncoding';
import {getState,openFileTab,patchState,requestStudio} from '../../store/appStore';
import {setActiveMedia} from '../media';
import {createOpenCoordinator,type OpenDeps,type OpenInput,type PreparedOpen,type OpenReport,type BatchOptions} from './openCoordinator';
import {MAX_OPEN_TEXT_BYTES} from './openResolver';
import './openHandlers';
import {answerOpenChoice,askOpenStudio} from './openChoice';
import {importSvg} from '../vectorio';
import {openSvgSource} from '../vectorstudio/session';
/**
 * App wiring of the Smart Open coordinator: the single entry for EXPLICIT Open (Project > Open file, starter Open buttons, global drop,
 * native dropped copies). Not used by: Video "add source", canvas Place image, chat/convert drops (import / attach), folder media
 * (background), blank-project creation (create). Those keep their own destination.
 */
export const TEXT_KINDS=new Set(['text','svg']);
const textEncoder=new TextEncoder();
async function bytesOf(f:IncomingFile):Promise<Uint8Array>{return f.blob?new Uint8Array(await f.blob.arrayBuffer()):textEncoder.encode(f.text);}
export const appDeps:OpenDeps={
 choose:askOpenStudio,
 async prepare(input,resolution):Promise<PreparedOpen>{
  const studioId=resolution.handler.studioId;
  if(TEXT_KINDS.has(resolution.kind)){
   if(input.bytes.length>MAX_OPEN_TEXT_BYTES)throw new Error('larger than 2 MB');
   const text=decodeFileBytes(input.name,input.bytes).text;let added:string[]=[];let live=true;
   // Vector rule: only SVG the strict importer accepts goes to Vector Studio. Anything else stays source in Code (never silently dropped).
   let target=studioId;
   if(studioId==='vector'){try{importSvg(text,{strict:true});}catch{target='code';}}
   if(target==='vector')return{name:input.name,studioId:target,dispose(){live=false;},
    commit(){if(!live)return{ok:false,error:'cancelled'};if(!openSvgSource(text,input.name,{strict:true}))return{ok:false,error:'Vector Studio kept the current document.'};added=commitTextFiles([{name:input.name,text}],{activate:false});return{ok:true,key:added[0]};},
    focus(key){openFileTab(key);}};
   return{name:input.name,studioId:target,dispose(){live=false;},
    commit(){if(!live)return{ok:false,error:'cancelled'};added=commitTextFiles([{name:input.name,text}],{activate:false});return{ok:true,key:added[0]};},
    focus(key){openFileTab(key);}};
  }
  const prepared=await prepareMediaFile(new Blob([input.bytes as BlobPart]),input.name);
  if('error' in prepared)throw new Error(prepared.error);
  return{name:input.name,studioId,dispose:prepared.dispose,
   commit(){const r=prepared.commit({activate:false});return'error' in r?{ok:false,error:r.error}:{ok:true,key:'media:'+r.name};},
   focus(key){setActiveMedia(key.slice('media:'.length));}};
 },
 switchStudio(studioId,key){requestStudio(studioId,'open',false,key);},
 notify(text){patchState({notice:text});},
 preferred:input=>getState().studioByTab[input.key??input.name]
};
export const coordinator=createOpenCoordinator(appDeps);
export async function openIncoming(files:IncomingFile[],opts:BatchOptions={}):Promise<OpenReport>{
 answerOpenChoice(null);
 const inputs:OpenInput[]=[];
 for(const f of files)inputs.push({name:f.name,bytes:await bytesOf(f)});
 // OS opens have no target context or remembered document override. Drops only suggest the visible Studio.
 return coordinator.openFiles(inputs,opts.source==='os'?{...opts,preferred:'',target:undefined}:opts);
}
installOpenIncoming(openIncoming);
