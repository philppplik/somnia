import {Menu} from '@base-ui/react/menu';
import {getStudio} from '../../lib/studios';
import {studioModes,resolveStudioMode,rememberStudioMode} from '../../lib/studios/modes';
import {commandEnabled,executeCommand,formatShortcut,listCommands} from '../../lib/commands';
import {getState,patchState,studioDocumentKey,useAppStore} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {isMarkdown,useMedia} from '../../lib/media';
import {useUiContext} from '../../lib/uiContextStore';
/** One contextual picker in View. No duplicate header control or unavailable personas. */
export function StudioViewMenu(){
 const s=useAppStore();const {t}=useT();const md=isMarkdown(s.activeFile)&&!useMedia().active;const commands=listCommands();const native=['raster','vector','pdf'].includes(useUiContext().domain);
 const studio=getStudio(s.activeStudio);const modes=studioModes(studio);const document=studioDocumentKey();
 const selected=modes.find(mode=>mode.viewMode===s.viewMode)??resolveStudioMode(studio,s.studioModeByDocument,document);
 if(!modes.length)return null;
 return <><Menu.RadioGroup value={selected?.id??''} aria-label={t('studio.viewMode')} onValueChange={async id=>{
  const mode=modes.find(mode=>mode.id===id);if(!mode)return;
  const command=commands.find(c=>c.id===mode.command);if(!command||!commandEnabled(command)||native)return;
  const applied=await executeCommand(mode.command);
  // An asynchronous command may switch documents; never stamp its mode on the new one.
  const current=getState();if(applied&&current.activeStudio===studio.id&&studioDocumentKey()===document)patchState({studioModeByDocument:rememberStudioMode(studio,current.studioModeByDocument,document,mode.id)});
 }}>
 {modes.map(mode=>{const command=commands.find(c=>c.id===mode.command);const label=t(md&&mode.viewMode?'md.view.'+mode.viewMode:mode.label);return <Menu.RadioItem key={mode.id} value={mode.id} closeOnClick className="menu-item" disabled={native||!command||!commandEnabled(command)} label={label}><span className="flex items-center gap-2"><span aria-hidden="true" className="w-3">{selected?.id===mode.id?'●':''}</span>{label}</span>{command?.shortcut&&<kbd>{formatShortcut(command.shortcut)}</kbd>}</Menu.RadioItem>;})}
 </Menu.RadioGroup><Menu.Separator className="my-1 h-px bg-line"/></>;
}
