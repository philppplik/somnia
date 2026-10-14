import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import {MIN_STRETCH,MAX_STRETCH,type StretchAnchor} from '../../lib/animation/keyStretch';
const field='h-6 min-w-0 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink select-text';
/** Timeline strip control: scale the selected keys in time around the first key or the playhead. */
export function KeyStretch({count}:{count:number}){
 const {t}=useT();const [pct,setPct]=useState('200');const [anchor,setAnchor]=useState<StretchAnchor>('first');
 const n=Number(pct),ok=count>0&&pct.trim()!==''&&n>=MIN_STRETCH&&n<=MAX_STRETCH;
 return <span className="flex items-center gap-1" role="group" aria-label={t('animation.keys.stretch')} data-testid="animation-keys-stretch">
  <NativeInput className={`${field} w-14`} type="number" min={MIN_STRETCH} max={MAX_STRETCH} step={10} value={pct} aria-label={t('animation.keys.stretch.percent')} onChange={e=>setPct(e.target.value)} data-testid="animation-keys-stretch-percent"/>
  <NativeSelect className={`${field} w-24`} value={anchor} aria-label={t('animation.keys.stretch.anchor')} onChange={e=>setAnchor(e.target.value as StretchAnchor)}><option value="first">{t('animation.keys.stretch.first')}</option><option value="playhead">{t('animation.keys.stretch.playhead')}</option></NativeSelect>
  <Button size="tiny" variant="ghost" disabled={!ok} title={t('animation.keys.stretch.hint')} onClick={()=>void executeCommand('animation.keys.stretch',{percent:n,anchor})} data-testid="animation-keys-stretch-go">{t('animation.keys.stretch')}</Button>
 </span>;
}
