import {Sparkles} from '../../lib/icons';
import {executeCommand} from '../../lib/commands';
import {useAppStore} from '../../store/appStore';
import {useT} from '../../lib/useT';
/** Opener at the bottom of the right icon rail: Vadivam sparkles on the Somnia gradient glow. */
export function AgentRailButton(){
 const {t}=useT();const open=useAppStore().agentOpen;
 return <div className="ag-rail-slot" data-open={open}>
  <span className="ag-rail-glow" aria-hidden="true"/>
  <button type="button" className="ag-rail-open" aria-label={t('agent.open')} title={`${t('agent.open')} (Ctrl+Alt+A)`} aria-pressed={open} onClick={()=>void executeCommand('agent.toggle')}><Sparkles size={17}/></button>
 </div>;
}
