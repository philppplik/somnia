import {useEffect,useState} from 'react';
import {AgentPanel} from './agent/AgentPanel';
import {SessionChat} from './SessionChat';
import {AgentBoardHost} from './agentBoard/AgentBoardHost';
import {Dialog,DialogContent,DialogTitle} from './ui/dialog';
import {useT} from '../lib/useT';
import {useCommunicationTab,selectCommunication} from '../lib/collab/communication';
import {getChatSession} from '../lib/collab/chatSession';
import {requestStudio} from '../store/appStore';
/** Agent and session Chat are opened from the right rail, not a second tab strip. The agent board opens from a compact toolbar button. */
export function CommunicationPanel(){
 const {t}=useT();
 const tab=useCommunicationTab();
 const [boardOpen,setBoardOpen]=useState(false);
 useEffect(()=>{if(tab==='vibespace'){requestStudio('vibespace');selectCommunication('agent');}},[tab]);
 useEffect(()=>()=>{getChatSession()?.setOpen(false);},[]);
 return <div className="communication-panel"><div className="communication-tabs"><button type="button" onClick={()=>setBoardOpen(true)}>{t('board.title')}</button></div><div className="communication-content">
  <div className="communication-agent" hidden={tab!=='agent'}><AgentPanel/></div>
  {tab==='chat'&&<SessionChat/>}
 </div>
 <Dialog open={boardOpen} onOpenChange={setBoardOpen}><DialogContent className="ab-board-popup" aria-label={t('board.title')}><DialogTitle className="sr-only">{t('board.title')}</DialogTitle><AgentBoardHost/></DialogContent></Dialog></div>;
}
