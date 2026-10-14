import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import {MAX_REPEATS,type RepeatMode} from '../../lib/animation/keyRepeat';
import {MAX_JITTER_FRAMES} from '../../lib/animation/keyJitterTime';
import {MIN_NTH,MAX_NTH} from '../../lib/animation/keyNth';
import type {ValueMode} from '../../lib/animation/keyValues';
const field='h-6 min-w-0 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink select-text';
/** Timeline strip control: repeat the selected keys as cycles or ping-pong. */
export function KeyRepeat({count:selected,layers}:{count:number;layers:readonly string[]}){
 const {t}=useT();const [n,setN]=useState('2');const [mode,setMode]=useState<RepeatMode>('cycle');
 const [amt,setAmt]=useState('10');const [vm,setVm]=useState<ValueMode>('offset');const [seed,setSeed]=useState(1);const [nth,setNth]=useState('2');const [jf,setJf]=useState('3');const jfN=Number(jf),jfOk=Number.isInteger(jfN)&&jfN>=1&&jfN<=MAX_JITTER_FRAMES;const nthN=Number(nth),nthOk=Number.isInteger(nthN)&&nthN>=MIN_NTH&&nthN<=MAX_NTH;const amount=Number(amt),amtOk=amt.trim()!==''&&Number.isFinite(amount);
 const num=Number(n),valid=Number.isInteger(num)&&num>=1&&num<=MAX_REPEATS;
 return <span className="flex shrink-0 items-center gap-1" role="group" aria-label={t('animation.keys.repeat')} data-testid="animation-keys-repeat">
  <NativeInput className={`${field} w-12`} type="number" min={1} max={MAX_REPEATS} step={1} value={n} aria-label={t('animation.keys.repeat.count')} onChange={e=>setN(e.target.value)} data-testid="animation-keys-repeat-count"/>
  <NativeSelect className={`${field} w-28 shrink-0`} value={mode} aria-label={t('animation.keys.repeat.mode')} onChange={e=>setMode(e.target.value as RepeatMode)} data-testid="animation-keys-repeat-mode"><option value="cycle">{t('animation.keys.repeat.cycle')}</option><option value="pingpong">{t('animation.keys.repeat.pingpong')}</option></NativeSelect>
  <Button size="tiny" variant="ghost" disabled={selected<2||!valid} title={t('animation.keys.repeat.hint')} onClick={()=>void executeCommand('animation.keys.repeat',{count:num,mode})} data-testid="animation-keys-repeat-go">{t('animation.keys.repeat')}</Button>
   <Button size="tiny" variant="ghost" disabled={selected<2} title={t('animation.keys.reverse.hint')} onClick={()=>void executeCommand('animation.keys.reverse',{})} data-testid="animation-keys-reverse">{t('animation.keys.reverse')}</Button>
  <Button size="tiny" variant="ghost" disabled={selected<2} title={t('animation.keys.invert.hint')} onClick={()=>void executeCommand('animation.keys.invert',{})} data-testid="animation-keys-invert">{t('animation.keys.invert')}</Button>
  <Button size="tiny" variant="ghost" disabled={!layers.length} title={t('animation.keys.range.before.hint')} onClick={()=>void executeCommand('animation.keys.selectRange',{side:'before',layers:[...layers]})} data-testid="animation-keys-before">{t('animation.keys.range.before')}</Button>
  <Button size="tiny" variant="ghost" disabled={!layers.length} title={t('animation.keys.range.after.hint')} onClick={()=>void executeCommand('animation.keys.selectRange',{side:'after',layers:[...layers]})} data-testid="animation-keys-after">{t('animation.keys.range.after')}</Button>
  <NativeInput className={`${field} w-16`} type="number" step={1} value={amt} aria-label={t('animation.keys.values.amount')} onChange={e=>setAmt(e.target.value)} data-testid="animation-keys-values-amount"/>
  <NativeSelect className={`${field} w-24 shrink-0`} value={vm} aria-label={t('animation.keys.values.mode')} onChange={e=>setVm(e.target.value as ValueMode)} data-testid="animation-keys-values-mode"><option value="offset">{t('animation.keys.values.offset')}</option><option value="scale">{t('animation.keys.values.scale')}</option><option value="snap">{t('animation.keys.values.snap')}</option><option value="wiggle">{t('animation.keys.values.wiggle')}</option><option value="smooth">{t('animation.keys.values.smooth')}</option></NativeSelect>
  <Button size="tiny" variant="ghost" disabled={selected<1||!amtOk} title={t('animation.keys.values.hint')} onClick={()=>{void executeCommand('animation.keys.values',{mode:vm,amount,seed});setSeed(x=>x+1);}} data-testid="animation-keys-values-go">{t('animation.keys.values')}</Button>
  <Button size="tiny" variant="ghost" disabled={selected<1} title={t('animation.keys.easeRandom.hint')} onClick={()=>{void executeCommand('animation.keys.easeRandom',{seed});setSeed(x=>x+1);}} data-testid="animation-keys-ease-random">{t('animation.keys.easeRandom')}</Button>
  <NativeInput className={`${field} w-12`} type="number" min={MIN_NTH} max={MAX_NTH} step={1} value={nth} aria-label={t('animation.keys.nth.step')} onChange={e=>setNth(e.target.value)} data-testid="animation-keys-nth-step"/>
  <Button size="tiny" variant="ghost" disabled={selected<2||!nthOk} title={t('animation.keys.nth.hint')} onClick={()=>void executeCommand('animation.keys.selectNth',{n:nthN})} data-testid="animation-keys-nth">{t('animation.keys.nth')}</Button>
  <Button size="tiny" variant="ghost" disabled={selected<3} title={t('animation.keys.distribute.hint')} onClick={()=>void executeCommand('animation.keys.distribute',{})} data-testid="animation-keys-distribute">{t('animation.keys.distribute')}</Button>
  <Button size="tiny" variant="ghost" disabled={selected<1} title={t('animation.keys.toPlayhead.hint')} onClick={()=>void executeCommand('animation.keys.toPlayhead',{})} data-testid="animation-keys-to-playhead">{t('animation.keys.toPlayhead')}</Button>
  <Button size="tiny" variant="ghost" disabled={!layers.length} title={t('animation.keys.range.at.hint')} onClick={()=>void executeCommand('animation.keys.selectRange',{side:'at',layers:[...layers]})} data-testid="animation-keys-at">{t('animation.keys.range.at')}</Button>
  <NativeInput className={`${field} w-12`} type="number" min={1} max={MAX_JITTER_FRAMES} step={1} value={jf} aria-label={t('animation.keys.jitter.frames')} onChange={e=>setJf(e.target.value)} data-testid="animation-keys-jitter-frames"/>
  <Button size="tiny" variant="ghost" disabled={selected<1||!jfOk} title={t('animation.keys.jitter.hint')} onClick={()=>{void executeCommand('animation.keys.jitterTime',{frames:jfN,seed});setSeed(x=>x+1);}} data-testid="animation-keys-jitter">{t('animation.keys.jitter')}</Button>
  <Button size="tiny" variant="ghost" disabled={selected<1} title={t('animation.keys.property.hint')} onClick={()=>void executeCommand('animation.keys.selectProperty',{})} data-testid="animation-keys-property">{t('animation.keys.property')}</Button>
 </span>;
}
