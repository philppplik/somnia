import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {Menu,MenuTrigger,MenuContent,MenuItem,MenuGroup,MenuGroupLabel,MenuSeparator} from '../ui/menu';
import {executeCommand} from '../../lib/commands';
interface Item{id:string;testid:string;label:string;hint:string;cmd:string;params:object;min:number;layers?:boolean}
/** Grouped menu for the key operations that used to crowd the timeline strip. Parameterized ones are presets; the commands keep their full parameters. */
export function KeyTools({selected,layers}:{selected:number;layers:readonly string[]}){
 const {t}=useT();
 const L={layers:[...layers]};
 const groups:{key:string;items:Item[]}[]=[
  {key:'animation.keys.tools.values',items:[
   {id:'flatten',testid:'animation-keys-flatten',label:t('animation.keys.flatten'),hint:t('animation.keys.flatten.hint'),cmd:'animation.keys.flatten',params:{},min:2},
   {id:'average',testid:'animation-keys-average',label:t('animation.keys.average'),hint:t('animation.keys.average.hint'),cmd:'animation.keys.flatten',params:{to:'average'},min:2},
   {id:'match',testid:'animation-keys-match',label:t('animation.keys.match'),hint:t('animation.keys.match.hint'),cmd:'animation.keys.matchPrevious',params:{},min:1},
   {id:'matchNext',testid:'animation-keys-match-next',label:t('animation.keys.matchNext'),hint:t('animation.keys.matchNext.hint'),cmd:'animation.keys.matchPrevious',params:{side:'next'},min:1},
   {id:'ramp',testid:'animation-keys-ramp',label:t('animation.keys.ramp'),hint:t('animation.keys.ramp.hint'),cmd:'animation.keys.ramp',params:{},min:3},
   {id:'thin',testid:'animation-keys-thin',label:`${t('animation.keys.thin')} 1`,hint:t('animation.keys.thin.hint'),cmd:'animation.keys.thin',params:{tolerance:1},min:1},
   {id:'keyAll',testid:'animation-keys-key-all',label:t('animation.keys.keyAll'),hint:t('animation.keys.keyAll.hint'),cmd:'animation.keys.keyAll',params:L,min:0,layers:true},
   {id:'echo5',testid:'animation-keys-echo',label:`${t('animation.keys.echo')} +5`,hint:t('animation.keys.echo.hint'),cmd:'animation.keys.echo',params:{frames:5},min:1},
   {id:'echo-5',testid:'animation-keys-echo-minus',label:`${t('animation.keys.echo')} -5`,hint:t('animation.keys.echo.hint'),cmd:'animation.keys.echo',params:{frames:-5},min:1}]},
  {key:'animation.keys.tools.ease',items:[
   {id:'easeCopy',testid:'animation-keys-ease-copy',label:t('animation.keys.easeCopy'),hint:t('animation.keys.easeCopy.hint'),cmd:'animation.keys.easeCopy',params:{},min:2},
   {id:'inf33',testid:'animation-keys-influence',label:`${t('animation.keys.influence')} 33%`,hint:t('animation.keys.influence.hint'),cmd:'animation.keys.influence',params:{percent:33},min:1},
   {id:'inf66',testid:'animation-keys-influence-66',label:`${t('animation.keys.influence')} 66%`,hint:t('animation.keys.influence.hint'),cmd:'animation.keys.influence',params:{percent:66},min:1},
   {id:'tame',testid:'animation-keys-tame',label:t('animation.keys.tame'),hint:t('animation.keys.tame.hint'),cmd:'animation.keys.tame',params:{},min:1}]},
  {key:'animation.keys.tools.select',items:[
   {id:'peaks',testid:'animation-keys-peaks',label:t('animation.keys.peaks'),hint:t('animation.keys.peaks.hint'),cmd:'animation.keys.selectPeaks',params:L,min:0,layers:true},
   {id:'invertSel',testid:'animation-keys-invert-selection',label:t('animation.keys.invertSel'),hint:t('animation.keys.invertSel.hint'),cmd:'animation.keys.invertSelection',params:L,min:0,layers:true},
   {id:'property',testid:'animation-keys-property',label:t('animation.keys.property'),hint:t('animation.keys.property.hint'),cmd:'animation.keys.selectProperty',params:{},min:1},
   {id:'nth2',testid:'animation-keys-nth',label:`${t('animation.keys.nth')} 2`,hint:t('animation.keys.nth.hint'),cmd:'animation.keys.selectNth',params:{n:2},min:2},
   {id:'nth3',testid:'animation-keys-nth-3',label:`${t('animation.keys.nth')} 3`,hint:t('animation.keys.nth.hint'),cmd:'animation.keys.selectNth',params:{n:3},min:2}]}];
 return <Menu><MenuTrigger render={<Button size="tiny" variant="ghost" data-testid="animation-keys-tools">{t('animation.keys.tools')}</Button>}/>
  <MenuContent>{groups.map((g,i)=><MenuGroup key={g.key}>{i>0&&<MenuSeparator/>}<MenuGroupLabel>{t(g.key)}</MenuGroupLabel>
   {g.items.map(it=><MenuItem key={it.id} disabled={it.layers?!layers.length:selected<it.min} title={it.hint} onClick={()=>void executeCommand(it.cmd,it.params)} data-testid={it.testid}>{it.label}</MenuItem>)}</MenuGroup>)}</MenuContent></Menu>;
}
