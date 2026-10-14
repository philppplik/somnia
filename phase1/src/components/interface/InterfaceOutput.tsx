import {patchInterfaceNode} from '../../lib/interface/components';
import {useEffect,useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useInterfaceState,interfaceSession} from '../../lib/interface/session';
import {exportInterfaceFrame,frameExportPNG,buildInterfaceHandoff,downloadInterfaceBlob,type FrameExport} from '../../lib/interface/export';
export function InterfaceOutput(){
 const s=useInterfaceState(),{t}=useT();const [review,setReview]=useState<FrameExport|null>(null),[handoff,setHandoff]=useState<ReturnType<typeof buildInterfaceHandoff>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const node=s.document?.nodes.find(n=>n.id===s.selection);
 useEffect(()=>{setReview(null);setHandoff(null);setError('');},[s.document?.id,s.selection]);
 const run=(f:()=>void)=>{try{f();setError('');}catch(e){setError(e instanceof Error?e.message:'Output failed.');}};
 if(node?.kind!=='frame')return null;
 const edit=(patch:{ready?:boolean;annotation?:string})=>run(()=>interfaceSession.transact(d=>{const n=d.nodes.find(n=>n.id===node.id)!;patchInterfaceNode(d,n.id,patch);}));
 const save=async(format:'svg'|'png')=>{if(!review||busy)return;setBusy(true);try{const blob=format==='svg'?new Blob([review.svg],{type:'image/svg+xml'}):await frameExportPNG(review);downloadInterfaceBlob(blob,`frame-${review.frameId}.${format}`);setError('');}catch(e){setError(e instanceof Error?e.message:'Export failed.');}finally{setBusy(false);}};
 return <details className="border-t border-subtle pt-3"><summary className="mb-2 cursor-pointer text-xs">{t('interface.output')}</summary><div className="flex flex-col gap-3">
 <label className="flex items-center gap-2 text-xs"><input style={{width:14}} type="checkbox" disabled={node.locked} checked={node.ready??false} onChange={e=>edit({ready:e.target.checked})}/>{t('interface.ready')}</label><label className="text-xs">{t('interface.annotation')}<textarea key={`${node.id}:${node.annotation}`} className="mt-1 min-h-16 w-full bg-panel p-2" maxLength={4000} disabled={node.locked} defaultValue={node.annotation??''} onBlur={e=>{if(e.target.value!==node.annotation)edit({annotation:e.target.value});}}/></label>
 <div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" onClick={()=>run(()=>setReview(exportInterfaceFrame(s.document!,node.id)))}>{t('interface.reviewExport')}</Button><Button size="compact" variant="outline" onClick={()=>run(()=>setHandoff(buildInterfaceHandoff(s.document!,node.id)))}>{t('interface.freezeHandoff')}</Button></div>
 {review&&<div className="rounded border border-subtle p-2 text-xs"><p>{t('interface.frozenRevision')} {review.revision} · {Math.round(review.width)} × {Math.round(review.height)}</p><ul className="my-2 pl-4">{review.warnings.map(w=><li key={w}>{w}</li>)}</ul><div className="flex gap-1"><Button disabled={busy} size="compact" variant="outline" onClick={()=>void save('svg')}>SVG</Button><Button disabled={busy} size="compact" variant="outline" onClick={()=>void save('png')}>PNG</Button></div></div>}
 {handoff&&<div className="rounded border border-subtle p-2 text-xs"><p>{t('interface.frozenRevision')} {handoff.revision}</p><ul className="my-2 pl-4">{handoff.warnings.map(w=><li key={w}>{w}</li>)}</ul><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all text-[10px]" data-copyable>{JSON.stringify(handoff,null,2)}</pre><Button size="compact" variant="outline" onClick={()=>downloadInterfaceBlob(new Blob([JSON.stringify(handoff,null,2)],{type:'application/json'}),'interface-handoff.json')}>{t('interface.downloadHandoff')}</Button></div>}
 {error&&<p role="alert" className="text-xs">{error}</p>}
 </div></details>;
}
