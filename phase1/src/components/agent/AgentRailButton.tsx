import {Sparkles} from '../../lib/icons';
import {defaultShortcut,executeCommand,formatShortcut,isMac} from '../../lib/commands';
import {useAppStore} from '../../store/appStore';
import {useCommunicationTab,selectCommunication} from '../../lib/collab/communication';
import {useT} from '../../lib/useT';
/** Opener at the bottom of the right icon rail: Vadivam sparkles on the Somnia gradient glow. */
export function AgentRailButton(){
 const {t}=useT();const agentOpen=useAppStore().agentOpen;const tab=useCommunicationTab();const open=agentOpen&&tab==='agent';
 return <div className="ag-rail-slot" data-open={open}>
  <span className="ag-rail-glow" aria-hidden="true"/>
  <button type="button" className="ag-rail-open" aria-label={t('agent.open')} title={`${t('agent.open')} (${formatShortcut(defaultShortcut('agent.toggle')??'Mod+Alt+A')})`} aria-keyshortcuts={isMac()?'Meta+Alt+A':'Control+Alt+A'} aria-pressed={open} onClick={()=>{if(agentOpen&&tab==='chat'){selectCommunication('agent');return;}void executeCommand('agent.toggle');}}><Sparkles size={17}/></button>
 </div>;
}
