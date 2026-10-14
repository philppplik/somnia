import {ReplaceSceneDialog} from './ReplaceSceneDialog';
import {StudioStatus} from '../studios/StudioStatus';
import {NativeInput} from '../ui/native-controls';
import {lazy,Suspense,useEffect,useRef} from 'react';
import {Boxes} from '../../lib/icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {MODEL_ACCEPT,ENV_ACCEPT} from '../../lib/studio3d/model';
import type {TextureSlot} from '../../lib/studio3d/materials';
import {registerStudio3DCommands,registerStudio3DOpener,registerStudio3DEnvOpener,registerStudio3DTextureOpener,registerStudio3DRecentOpener,studio3DController} from '../../lib/studio3d/commands';
import {useStudio3D,patchStudio3D,getStudio3DState} from '../../lib/studio3d/session';
import {registerStudio3DSaveShortcut} from './saveShortcut';
import {refreshRecent,recentAsFile} from '../../lib/studio3d/recentSession';
import {RecentList} from './Studio3DPanels';
/** three.js lives in its own chunk. Nothing 3D is loaded until this studio is shown. */
const Viewport3D=lazy(()=>import('./Viewport3D'));
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Canvas of the 3D Studio: the start screen until a model or blank scene exists, then the viewport. */
export function Studio3DCanvas(){
 const {t}=useT();const s=useStudio3D();const input=useRef<HTMLInputElement|null>(null);
 useEffect(()=>registerStudio3DCommands(),[]);
 const envInput=useRef<HTMLInputElement|null>(null);
 const texInput=useRef<HTMLInputElement|null>(null);const texSlot=useRef<TextureSlot>('color');
 useEffect(()=>registerStudio3DTextureOpener(slot=>{texSlot.current=slot;texInput.current?.click();}),[]);
 const pick=()=>input.current?.click();
 useEffect(()=>registerStudio3DEnvOpener(()=>envInput.current?.click()),[]);
 useEffect(()=>registerStudio3DOpener(pick),[]);
 useEffect(()=>registerStudio3DSaveShortcut(),[]);
 useEffect(()=>{void refreshRecent();},[]);
 /** The viewport mounts after the first request, so a request made from the start screen waits for its controller. */
 const withController=async(run:(c:NonNullable<ReturnType<typeof studio3DController>>)=>void|Promise<void>)=>{
  patchStudio3D({status:'loading',error:''});
  for(let i=0;i<100&&!studio3DController();i++)await sleep(50);
  const c=studio3DController();if(!c){patchStudio3D({status:'error',error:'The 3D viewport could not start.'});return;}
  await run(c);
 };
 useEffect(()=>registerStudio3DRecentOpener(async id=>{
  const file=await recentAsFile(id);
  if(!file){patchStudio3D({error:'That scene is no longer stored in this browser.'});void refreshRecent();return;}
  await withController(c=>c.openFiles([file]));
 }),[]);
 useEffect(()=>{
  const model=s.pending;if(!model)return;
  patchStudio3D({pending:null});
  void withController(c=>c.openFiles([new File([model.bytes as BlobPart],model.name)]));
 },[s.pending]);
 const active=s.status!=='idle'||s.blank||!!s.pending;
 return <main className="center" aria-label={t('studio3d.title')}><div className="workspace"><section className="code-pane" aria-label={t('studio3d.title')}
  onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}}
  onDrop={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.stopPropagation();const files=[...(e.dataTransfer.files??[])];if(files.length)void withController(c=>c.openFiles(files));}}>
  <FileTabs/>
  <input ref={input} type="file" accept={MODEL_ACCEPT} multiple hidden data-testid="studio3d-file-input" onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';if(files.length)void withController(c=>c.openFiles(files));}}/>
  <input ref={envInput} type="file" accept={ENV_ACCEPT} hidden data-testid="studio3d-env-input" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void withController(async c=>{try{await c.openEnvFile(f);patchStudio3D({status:'ready',error:''});}catch(err){patchStudio3D({status:'ready',error:err instanceof Error?err.message:String(err)});}});}}/>
  <NativeInput ref={texInput} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="studio3d-texture-input" onChange={e=>{const f=e.target.files?.[0];e.target.value='';const id=getStudio3DState().selected;if(f&&id!=null)void withController(async c=>{try{await c.setTextureFile(id,texSlot.current,f);patchStudio3D({status:'ready',error:''});}catch(err){patchStudio3D({status:'ready',error:err instanceof Error?err.message:String(err)});}});}}/>
  <ReplaceSceneDialog open={!!s.confirmReplace} onCancel={()=>patchStudio3D({confirmReplace:null})} onConfirm={()=>{const r=s.confirmReplace;if(r)void withController(c=>r.what==='new'?c.newScene(true):c.openFiles(r.files,true));}}/>
  {active?<Suspense fallback={<StudioStatus className="p-4 text-xs">{t('studio3d.status.loading',{name:''})}</StudioStatus>}><Viewport3D/></Suspense>:
   <><StudioEmptyState studio="3d" icon={<Boxes/>} onOpen={pick} onCreate={()=>withController(c=>c.newScene())}/><RecentList/></>}
 </section></div></main>;
}
