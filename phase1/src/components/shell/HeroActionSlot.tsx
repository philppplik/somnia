import {ChromeMenu as Menu} from '../ui/menu';
import {Tooltip} from '@base-ui/react/tooltip';
import {ChevronDown,Loader2} from 'lucide-react';
import {Button} from '../ui/button';
import {useSyncExternalStore} from 'react';
import {PublishButton} from '../PublishDialog';
import {commandEnabled,executeCommand,formatShortcut,listCommands} from '../../lib/commands';
import {getCommandRegistryVersion,subscribeCommandRegistry} from '../../lib/commandRegistry';
import {getPublishStore,publishAvailable} from '../../lib/deploy/publishController';
import {resolveHeroAction,type HeroCommandInfo} from '../../lib/shell/heroAction';
import {resolveRailIcon} from '../../lib/shell/railIcons';
import {getStudio} from '../../lib/studios';
import {useStudioContext} from '../../lib/shell/studioContext';
import {useUiContext} from '../../lib/uiContextStore';
import {useT} from '../../lib/useT';
import {useAppStore} from '../../store/appStore';

const lookup=(id:string):HeroCommandInfo|undefined=>{const c=listCommands().find(x=>x.id===id);if(!c)return undefined;const enabled=commandEnabled(c);return {id,title:c.title,shortcut:c.shortcut,enabled,...(c.disabledReason?{disabledReason:enabled?undefined:c.disabledReason()}:{})};};
const joinTip=(label:string,shortcut?:string)=>shortcut?`${label} (${formatShortcut(shortcut)})`:label;

/**
 * The one header slot left of the Account pill. It renders whatever the active studio declares in `header.heroAction`,
 * or the old Publish button when it declares nothing. Nothing here branches on a studio id.
 */
export function HeroActionSlot(){
 const s=useAppStore();const context=useUiContext();const studioContext=useStudioContext(s.activeStudio);
 // Studios register their hero commands when the canvas mounts: re-resolve when the registry changes.
 useSyncExternalStore(subscribeCommandRegistry,getCommandRegistryVersion,getCommandRegistryVersion);
 const def=getStudio(s.activeStudio).shell.header.heroAction;
 // Generic slot context: UI context + the active canvas's StudioContext + app-level preview state (`pressedWhen: 'preview'`).
 const resolved=resolveHeroAction(def,{...context,...studioContext,preview:s.livePreview},lookup);
 if(resolved.kind==='default')return <PublishButton/>;
 return <HeroSplitButton resolved={resolved}/>;
}

/** Background deploy state. Off desktop there is no publish store (and nothing to run), so it is never touched. */
function usePublishBusy(available:boolean){
 const store=available?getPublishStore():null;
 return useSyncExternalStore(store?store.subscribe:noopSubscribe,()=>store?.getState().busy??null,()=>null);
}
const noopSubscribe=()=>()=>{};
function HeroSplitButton({resolved}:{resolved:Extract<ReturnType<typeof resolveHeroAction>,{kind:'hero'}>}){
 const {t}=useT();const available=publishAvailable();
 const busy=usePublishBusy(available);const running=busy==='publish'||busy==='rollback';
 const label=t(resolved.labelKey);const Icon=resolveRailIcon(resolved.icon);
 const more=t('hero.more');
 const tip=resolved.pressed&&resolved.pressedTooltipKey?t(resolved.pressedTooltipKey):!resolved.enabled&&resolved.disabledReason?t(resolved.disabledReason):joinTip(!resolved.enabled&&resolved.disabledLabelKey?t(resolved.disabledLabelKey):label,resolved.shortcut);
 /** Web build: Publish cannot run, so a chevron that only holds a disabled Publish is noise. */
 const showMenu=resolved.menu.some(m=>!m.publish)||available;
 return <Tooltip.Provider delay={250}><div role="group" aria-label={label} data-testid="hero-action" data-hero-id={resolved.id} className="flex shrink-0 items-center">
  <Tooltip.Root><Tooltip.Trigger render={<Button variant="outline" title="" aria-label={label} disabled={!resolved.enabled} data-testid="hero-action-main" {...(resolved.toggle?{'aria-pressed':resolved.pressed}:{})} className={`!h-8 ${resolved.toggle&&resolved.pressed?'bg-accent-soft text-accent ':''}${showMenu?'rounded-l-[var(--r-control)] rounded-r-none border-r-0':'rounded-[var(--r-control)]'}`} onClick={()=>void executeCommand(resolved.id)}/>}>
   <Icon size={14}/><span className="max-w-[120px] truncate max-[960px]:hidden">{label}</span>
  </Tooltip.Trigger><Tooltip.Portal><Tooltip.Positioner className="z-50" side="bottom" sideOffset={8}><Tooltip.Popup role="tooltip" className="studio-pill-tooltip">{tip}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal></Tooltip.Root>
  {showMenu&&<Menu.Root><Menu.Trigger render={<Button variant="outline" size="icon" title="" aria-label={running?`${more} (${t('deploy.button.running')})`:more} data-testid="hero-action-menu" data-publish-running={running?'true':undefined} className="!h-8 rounded-l-none rounded-r-[var(--r-control)]"/>}>
   {running?<Loader2 size={14} className="publish-spin"/>:<ChevronDown size={14}/>}
  </Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={4} align="end"><Menu.Popup className="menu-popup" data-testid="hero-action-popup">
   {resolved.menu.map((m,i)=><div key={m.id} className="contents">
    {m.publish&&i>0&&<Menu.Separator className="my-1 h-px bg-line"/>}
    <Menu.Item className="menu-item" data-command={m.id} disabled={!m.enabled} onClick={()=>void executeCommand(m.id)}><span>{m.publish&&running?t('deploy.button.running'):m.title}</span>{m.publish&&running?<Loader2 size={14} className="publish-spin" aria-hidden="true"/>:m.shortcut&&<kbd>{formatShortcut(m.shortcut)}</kbd>}</Menu.Item>
   </div>)}
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>}
  <span className="sr-only" aria-live="polite">{running?t('deploy.button.running'):''}</span>
 </div></Tooltip.Provider>;
}
