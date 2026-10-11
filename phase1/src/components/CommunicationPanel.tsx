import {useEffect} from 'react';
import {AgentPanel} from './agent/AgentPanel';
import {SessionChat} from './SessionChat';
import {useCommunicationTab,selectCommunication} from '../lib/collab/communication';
import {getChatSession} from '../lib/collab/chatSession';
import {requestStudio} from '../store/appStore';
/** Agent and session Chat are opened from the right rail, not a second tab strip. */
export function CommunicationPanel(){
 const tab=useCommunicationTab();
 useEffect(()=>{if(tab==='vibespace'){requestStudio('vibespace');selectCommunication('agent');}},[tab]);
 useEffect(()=>()=>{getChatSession()?.setOpen(false);},[]);
 return <div className="communication-panel"><div className="communication-content">
  <div className="communication-agent" hidden={tab!=='agent'}><AgentPanel/></div>
  {tab==='chat'&&<SessionChat/>}
 </div></div>;
}
