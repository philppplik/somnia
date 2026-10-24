import {useRef,useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {interfaceSession,useInterfaceState} from '../../lib/interface/session';
import {prepareRasterAsset,attachRasterAsset} from '../../lib/interface/assets';
import {parseInterfaceSVG,attachSVGSnapshot} from '../../lib/interface/vector';
import {insideInstance} from '../../lib/interface/model';
export async function importInterfaceFile(file:File,frameId:string,asFill=false){
 const before=interfaceSession.get().document;if(!before)throw Error('No document.');
 if(file.size>1_000_000)throw Error('Import exceeds 1 MB.');const bytes=new Uint8Array(await file.arrayBuffer());const svg=/^\s*<svg(?:\s|>)/.test(new TextDecoder().decode(bytes.slice(0,500)));
 if(svg){if(asFill)throw Error('SVG imports as editable shapes, not an image fill.');const snapshot=parseInterfaceSVG(new TextDecoder().decode(bytes));if(interfaceSession.get().document?.id!==before.id||interfaceSession.get().document?.revision!==before.revision)throw Error('Document changed during import. Try again.');let ids:string[]=[];interfaceSession.transact(d=>{ids=attachSVGSnapshot(d,frameId,snapshot);});interfaceSession.select(ids[0]??null);interfaceSession.notice(snapshot.warnings.join(' '));}
 else{const asset=await prepareRasterAsset(file);if(interfaceSession.get().document?.id!==before.id||interfaceSession.get().document?.revision!==before.revision)throw Error('Document changed during import. Try again.');let id='';interfaceSession.transact(d=>{id=attachRasterAsset(d,frameId,asset,asFill);});interfaceSession.select(id);}
}
export function InterfaceMediaControls(){
 const s=useInterfaceState(),{t}=useT(),input=useRef<HTMLInputElement>(null),[fill,setFill]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const node=s.document?.nodes.find(n=>n.id===s.selection);if(node?.kind!=='frame')return null;const disabled=node.locked||insideInstance(s.document!,node.id);
 const run=async(file:File)=>{setBusy(true);try{await importInterfaceFile(file,node.id,fill);setError('');}catch(e){setError(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false);}};
 return <details className="border-t border-subtle pt-3"><summary className="mb-2 text-xs">{t('interface.importMedia')}</summary><input ref={input} className="hidden" aria-label={t('interface.importMedia')} type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(file);}}/><div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" disabled={disabled||busy} onClick={()=>{setFill(false);input.current?.click();}}>{t('interface.importShapes')}</Button><Button size="compact" variant="outline" disabled={disabled||busy} onClick={()=>{setFill(true);input.current?.click();}}>{t('interface.imageFill')}</Button></div>{error&&<p role="alert" className="mt-2 text-xs">{error}</p>}</details>;
}
