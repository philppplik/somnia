import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import type {Composition} from '../../lib/animation/model';
/** Left-panel section: tick layers, then chain them, group them under a control null, or release their parents. Tick order is the chain order. */
export function RigPanel({comp}:{comp:Composition}){
 const {t}=useT();const [ticked,setTicked]=useState<string[]>([]);
 const ids=ticked.filter(id=>comp.layers.some(l=>l.id===id));
 const toggle=(id:string)=>setTicked(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const run=(cmd:string)=>void executeCommand(cmd,{layers:ids});
 const real=comp.layers.filter(l=>l.kind!=='audio');
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-rig"><legend className="text-ink-3">{t('animation.rig.title')}</legend>
  <ul className="m-0 grid max-h-40 list-none gap-1 overflow-auto p-0">{real.map(l=>{const n=ids.indexOf(l.id);return <li key={l.id}><label className="flex min-w-0 items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={n>=0} onChange={()=>toggle(l.id)} data-testid={`animation-rig-pick-${l.id}`}/><span className="min-w-0 truncate">{l.name}</span>{n>=0&&<span className="text-ink-3">{n+1}</span>}</label></li>;})}</ul>
  <div className="grid min-w-0 gap-1">
   <Button size="compact" variant="outline" disabled={ids.length<2} onClick={()=>run('animation.rig.chain')} data-testid="animation-rig-chain">{t('animation.rig.chain')}</Button>
   <Button size="compact" variant="outline" disabled={ids.length<1} onClick={()=>run('animation.rig.group')} data-testid="animation-rig-group">{t('animation.rig.group')}</Button>
   <Button size="compact" variant="outline" disabled={ids.length<1} onClick={()=>run('animation.rig.release')} data-testid="animation-rig-release">{t('animation.rig.release')}</Button></div>
  <div className="text-ink-3">{t('animation.rig.hint')}</div>
 </fieldset>;
}
