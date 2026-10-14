import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import {MAX_REPEATS,type RepeatMode} from '../../lib/animation/keyRepeat';
const field='h-6 min-w-0 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink select-text';
/** Timeline strip control: repeat the selected keys as cycles or ping-pong. */
export function KeyRepeat({count:selected,layers}:{count:number;layers:readonly string[]}){
 const {t}=useT();const [n,setN]=useState('2');const [mode,setMode]=useState<RepeatMode>('cycle');
 const num=Number(n),valid=Number.isInteger(num)&&num>=1&&num<=MAX_REPEATS;
 return <span className="flex shrink-0 items-center gap-1" role="group" aria-label={t('animation.keys.repeat')} data-testid="animation-keys-repeat">
  <NativeInput className={`${field} w-12`} type="number" min={1} max={MAX_REPEATS} step={1} value={n} aria-label={t('animation.keys.repeat.count')} onChange={e=>setN(e.target.value)} data-testid="animation-keys-repeat-count"/>
  <NativeSelect className={`${field} w-28 shrink-0`} value={mode} aria-label={t('animation.keys.repeat.mode')} onChange={e=>setMode(e.target.value as RepeatMode)} data-testid="animation-keys-repeat-mode"><option value="cycle">{t('animation.keys.repeat.cycle')}</option><option value="pingpong">{t('animation.keys.repeat.pingpong')}</option></NativeSelect>
  <Button size="tiny" variant="ghost" disabled={selected<2||!valid} title={t('animation.keys.repeat.hint')} onClick={()=>void executeCommand('animation.keys.repeat',{count:num,mode})} data-testid="animation-keys-repeat-go">{t('animation.keys.repeat')}</Button>
   <Button size="tiny" variant="ghost" disabled={selected<2} title={t('animation.keys.reverse.hint')} onClick={()=>void executeCommand('animation.keys.reverse',{})} data-testid="animation-keys-reverse">{t('animation.keys.reverse')}</Button>
  <Button size="tiny" variant="ghost" disabled={selected<2} title={t('animation.keys.invert.hint')} onClick={()=>void executeCommand('animation.keys.invert',{})} data-testid="animation-keys-invert">{t('animation.keys.invert')}</Button>
  <Button size="tiny" variant="ghost" disabled={!layers.length} title={t('animation.keys.range.before.hint')} onClick={()=>void executeCommand('animation.keys.selectRange',{side:'before',layers:[...layers]})} data-testid="animation-keys-before">{t('animation.keys.range.before')}</Button>
  <Button size="tiny" variant="ghost" disabled={!layers.length} title={t('animation.keys.range.after.hint')} onClick={()=>void executeCommand('animation.keys.selectRange',{side:'after',layers:[...layers]})} data-testid="animation-keys-after">{t('animation.keys.range.after')}</Button>
 </span>;
}
