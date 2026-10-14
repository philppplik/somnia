import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {Menu,MenuTrigger,MenuContent,MenuItem,MenuSubmenu,MenuSubmenuTrigger} from '../ui/menu';
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
  ]},
  {key:'animation.keys.tools.time',items:[
   {id:'keyAll',testid:'animation-keys-key-all',label:t('animation.keys.keyAll'),hint:t('animation.keys.keyAll.hint'),cmd:'animation.keys.keyAll',params:L,min:0,layers:true},
   {id:'trim',testid:'animation-keys-trim',label:t('animation.keys.trim'),hint:t('animation.keys.trim.hint'),cmd:'animation.keys.trimToWorkArea',params:L,min:0,layers:true},
   {id:'echo5',testid:'animation-keys-echo',label:`${t('animation.keys.echo')} +5`,hint:t('animation.keys.echo.hint'),cmd:'animation.keys.echo',params:{frames:5},min:1},
   {id:'echo-5',testid:'animation-keys-echo-minus',label:`${t('animation.keys.echo')} -5`,hint:t('animation.keys.echo.hint'),cmd:'animation.keys.echo',params:{frames:-5},min:1},
   {id:'grid2',testid:'animation-keys-grid-2',label:`${t('animation.keys.grid')} ${2}`,hint:t('animation.keys.grid.hint'),cmd:'animation.keys.snapToGrid',params:{frames:2},min:1},
   {id:'grid4',testid:'animation-keys-grid-4',label:`${t('animation.keys.grid')} ${4}`,hint:t('animation.keys.grid.hint'),cmd:'animation.keys.snapToGrid',params:{frames:4},min:1},
   {id:'grid8',testid:'animation-keys-grid-8',label:`${t('animation.keys.grid')} ${8}`,hint:t('animation.keys.grid.hint'),cmd:'animation.keys.snapToGrid',params:{frames:8},min:1}]},
  {key:'animation.keys.tools.ease',items:[
   {id:'easeCopy',testid:'animation-keys-ease-copy',label:t('animation.keys.easeCopy'),hint:t('animation.keys.easeCopy.hint'),cmd:'animation.keys.easeCopy',params:{},min:2},
   {id:'inf33',testid:'animation-keys-influence',label:`${t('animation.keys.influence')} 33%`,hint:t('animation.keys.influence.hint'),cmd:'animation.keys.influence',params:{percent:33},min:1},
   {id:'inf66',testid:'animation-keys-influence-66',label:`${t('animation.keys.influence')} 66%`,hint:t('animation.keys.influence.hint'),cmd:'animation.keys.influence',params:{percent:66},min:1},
   {id:'tame',testid:'animation-keys-tame',label:t('animation.keys.tame'),hint:t('animation.keys.tame.hint'),cmd:'animation.keys.tame',params:{},min:1}]},
  {key:'animation.keys.tools.select',items:[
   {id:'workArea',testid:'animation-keys-work-area',label:t('animation.keys.workArea'),hint:t('animation.keys.workArea.hint'),cmd:'animation.keys.workAreaToKeys',params:{},min:1},
   {id:'inArea',testid:'animation-keys-in-work-area',label:t('animation.keys.inArea'),hint:t('animation.keys.inArea.hint'),cmd:'animation.keys.selectInWorkArea',params:L,min:0,layers:true},
   {id:'selBefore',testid:'animation-keys-select-before',label:t('animation.keys.selBefore'),hint:t('animation.keys.selBefore.hint'),cmd:'animation.keys.selectAroundPlayhead',params:{side:'before',...L},min:0,layers:true},
   {id:'selAfter',testid:'animation-keys-select-after',label:t('animation.keys.selAfter'),hint:t('animation.keys.selAfter.hint'),cmd:'animation.keys.selectAroundPlayhead',params:{side:'after',...L},min:0,layers:true},
   {id:'selAt',testid:'animation-keys-select-at',label:t('animation.keys.selAt'),hint:t('animation.keys.selAt.hint'),cmd:'animation.keys.selectAroundPlayhead',params:{side:'at',...L},min:0,layers:true},
   {id:'ends',testid:'animation-keys-ends',label:t('animation.keys.ends'),hint:t('animation.keys.ends.hint'),cmd:'animation.keys.selectEnds',params:L,min:0,layers:true},
   {id:'selHold',testid:'animation-keys-select-hold',label:t('animation.keys.selHold'),hint:t('animation.keys.selInterp.hint'),cmd:'animation.keys.selectByInterp',params:{interp:'hold',...L},min:0,layers:true},
   {id:'selLinear',testid:'animation-keys-select-linear',label:t('animation.keys.selLinear'),hint:t('animation.keys.selInterp.hint'),cmd:'animation.keys.selectByInterp',params:{interp:'linear',...L},min:0,layers:true},
   {id:'selBezier',testid:'animation-keys-select-bezier',label:t('animation.keys.selBezier'),hint:t('animation.keys.selInterp.hint'),cmd:'animation.keys.selectByInterp',params:{interp:'bezier',...L},min:0,layers:true},
   {id:'grow',testid:'animation-keys-grow',label:t('animation.keys.grow'),hint:t('animation.keys.grow.hint'),cmd:'animation.keys.growSelection',params:{},min:1},
   {id:'shrink',testid:'animation-keys-shrink',label:t('animation.keys.shrink'),hint:t('animation.keys.shrink.hint'),cmd:'animation.keys.shrinkSelection',params:{},min:3},
   {id:'peaks',testid:'animation-keys-peaks',label:t('animation.keys.peaks'),hint:t('animation.keys.peaks.hint'),cmd:'animation.keys.selectPeaks',params:L,min:0,layers:true},
   {id:'invertSel',testid:'animation-keys-invert-selection',label:t('animation.keys.invertSel'),hint:t('animation.keys.invertSel.hint'),cmd:'animation.keys.invertSelection',params:L,min:0,layers:true},
   {id:'property',testid:'animation-keys-property',label:t('animation.keys.property'),hint:t('animation.keys.property.hint'),cmd:'animation.keys.selectProperty',params:{},min:1},
   {id:'nth2',testid:'animation-keys-nth',label:`${t('animation.keys.nth')} 2`,hint:t('animation.keys.nth.hint'),cmd:'animation.keys.selectNth',params:{n:2},min:2},
   {id:'nth3',testid:'animation-keys-nth-3',label:`${t('animation.keys.nth')} 3`,hint:t('animation.keys.nth.hint'),cmd:'animation.keys.selectNth',params:{n:3},min:2}]}];
 const run=(it:Item)=><MenuItem key={it.id} disabled={it.layers?!layers.length:selected<it.min} title={it.hint} onClick={()=>void executeCommand(it.cmd,it.params)} data-testid={it.testid}>{it.label}</MenuItem>;
 return <Menu><MenuTrigger render={<Button size="tiny" variant="ghost" data-testid="animation-keys-tools">{t('animation.keys.tools')}</Button>}/>
  <MenuContent>{groups.map(g=><MenuSubmenu key={g.key}><MenuSubmenuTrigger className="menu-item" data-testid={`${g.key.replace('animation.keys.tools.','animation-keys-group-')}`}>{t(g.key)}<span aria-hidden="true">›</span></MenuSubmenuTrigger>
   <MenuContent>{g.items.map(run)}</MenuContent></MenuSubmenu>)}</MenuContent></Menu>;
}
