import {Menu} from '@base-ui/react/menu';
import {getStudio} from '../../lib/studios';
import {commandEnabled,executeCommand,formatShortcut,listCommands} from '../../lib/commands';
import {useAppStore} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {isMarkdown,useMedia} from '../../lib/media';
import {useUiContext} from '../../lib/uiContextStore';
export function StudioViewMenu(){
 const s=useAppStore();const {t}=useT();const md=isMarkdown(s.activeFile)&&!useMedia().active;const commands=listCommands();const native=['raster','vector','pdf'].includes(useUiContext().domain);
 return <><Menu.RadioGroup value={s.viewMode} aria-label={t('studio.viewMode')} onValueChange={mode=>{const view=getStudio(s.activeStudio).shell.header.views.find(v=>v.mode===mode);if(view)void executeCommand(view.command);}}>
 {getStudio(s.activeStudio).shell.header.views.map(view=>{const command=commands.find(c=>c.id===view.command);return <Menu.RadioItem key={view.mode} value={view.mode} closeOnClick className="menu-item" disabled={native||!command||!commandEnabled(command)} label={t(md?'md.view.'+view.mode:'cmd.'+view.command)}><span className="flex items-center gap-2"><span aria-hidden="true" className="w-3">{s.viewMode===view.mode?'●':''}</span>{t(md?'md.view.'+view.mode:'cmd.'+view.command)}</span>{command?.shortcut&&<kbd>{formatShortcut(command.shortcut)}</kbd>}</Menu.RadioItem>;})}
 </Menu.RadioGroup><Menu.Separator className="my-1 h-px bg-line"/></>;
}
