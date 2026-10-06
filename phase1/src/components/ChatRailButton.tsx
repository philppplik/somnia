import {MessageSquare} from '../lib/icons';
import {Button} from './ui/button';
import {executeCommand} from '../lib/commands';
import {useAppStore} from '../store/appStore';
import {useChatSession} from '../lib/collab/chatSession';
import {useCommunicationTab} from '../lib/collab/communication';
import {cn} from '../lib/cn';
import {useT} from '../lib/useT';
/** Chat opener above the agent button in the right rail. Rendered only while a collab session is active. */
export function ChatRailButton(){
 const {t}=useT();const chat=useChatSession();const open=useAppStore().agentOpen;const tab=useCommunicationTab();
 if(!chat)return null;
 const active=open&&tab==='chat';const unread=active?0:chat.unread;
 const label=unread>0?t(unread===1?'chat.railUnreadOne':'chat.railUnread',{count:unread}):active?t('chat.close'):t('chat.open');
 return <Button size="icon" data-testid="chat-rail-open" className={cn('chat-rail-open relative',active&&'bg-accent-soft text-accent')} aria-label={label} title={`${active?t('chat.close'):t('chat.open')} (Ctrl+Alt+C)`} aria-pressed={active} aria-keyshortcuts="Control+Alt+C" onClick={()=>void executeCommand('chat.toggle')}><MessageSquare size={18}/>{unread>0&&<span className="collab-unread" aria-hidden="true">{unread>9?'9+':unread}</span>}</Button>;
}
