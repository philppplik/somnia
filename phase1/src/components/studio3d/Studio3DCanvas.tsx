import {lazy,Suspense,useEffect,useRef} from 'react';
import {Boxes} from '../../lib/icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {MODEL_ACCEPT} from '../../lib/studio3d/model';
import {registerStudio3DCommands,registerStudio3DOpener,studio3DController} from '../../lib/studio3d/commands';
import {useStudio3D,patchStudio3D} from '../../lib/studio3d/session';
/** three.js lives in its own chunk. Nothing 3D is loaded until this studio is shown. */
const Viewport3D=lazy(()=>import('./Viewport3D'));
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Canvas of the 3D Studio: the start screen until a model or blank scene exists, then the viewport. */
export function Studio3DCanvas(){
 const {t}=useT();const s=useStudio3D();const input=useRef<HTMLInputElement|null>(null);
 useEffect(()=>registerStudio3DCommands(),[]);
 const pick=()=>input.current?.click();
 useEffect(()=>registerStudio3DOpener(pick),[]);
 /** The viewport mounts after the first request, so a request made from the start screen waits for its controller. */
 const withController=async(run:(c:NonNullable<ReturnType<typeof studio3DController>>)=>void|Promise<void>)=>{
  patchStudio3D({status:'loading',error:''});
  for(let i=0;i<100&&!studio3DController();i++)await sleep(50);
  const c=studio3DController();if(!c){patchStudio3D({status:'error',error:'The 3D viewport could not start.'});return;}
  await run(c);
 };
 useEffect(()=>{
  const model=s.pending;if(!model)return;
  patchStudio3D({pending:null});
  void withController(c=>c.openFiles([new File([model.bytes as BlobPart],model.name)]));
 },[s.pending]);
 const active=s.status!=='idle'||s.blank||!!s.pending;
 return <main className="center" aria-label={t('studio3d.title')}><div className="workspace"><section className="code-pane" aria-label={t('studio3d.title')}>
  <FileTabs/>
  <input ref={input} type="file" accept={MODEL_ACCEPT} multiple hidden data-testid="studio3d-file-input" onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';if(files.length)void withController(c=>c.openFiles(files));}}/>
  {active?<Suspense fallback={<p className="p-4 text-xs text-ink-3" role="status">{t('studio3d.status.loading',{name:''})}</p>}><Viewport3D/></Suspense>:
   <StudioEmptyState studio="3d" icon={<Boxes/>} onOpen={pick} onCreate={()=>withController(c=>c.newScene())}/>}
 </section></div></main>;
}
