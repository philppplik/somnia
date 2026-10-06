import {safeAwareness} from './awarenessSafe';
import {cursorBadges} from './cursorBadges';
import {getChatSession} from './chatSession';
import {remoteSelections} from './remoteSelections';
import {yCollab,yRemoteSelections} from 'y-codemirror.next';
import {Compartment,type Extension} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {getCollab,getSafeAwareness} from './session';
import {isCollabFile} from './paths';
/** Bind the code editor to the shared text of `file` while a session runs. Returns false when nothing was bound.
 * The editor document is first set to the shared text so both sides start equal, then y-codemirror.next keeps them in sync
 * (text, remote cursors and selections via the sanitised awareness). A file that is not in the shared project yet is never
 * seeded from here: a guest must not push local text into a file the host owns. */
export function attachCollab(view:EditorView,slot:Compartment,file:string):boolean{
 const c=getCollab(),aw=c?safeAwareness(c.awareness,file,id=>getChatSession()?.colour(id)):getSafeAwareness();
 const ytext=c&&aw&&isCollabFile(file)?c.files.get(file):undefined;
 if(!c||!aw||!ytext){detachCollab(view,slot);return false;}
 const shared=ytext.toString();
 if(view.state.doc.toString()!==shared)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:shared}});
 c.awareness.setLocalStateField('file',file);c.awareness.setLocalStateField('cursor',null);
 view.dispatch({effects:slot.reconfigure([(yCollab(ytext,aw) as Extension[]).filter(extension=>extension!==yRemoteSelections),remoteSelections,cursorBadges(aw)])});
 return true;
}
export function detachCollab(view:EditorView,slot:Compartment){view.dispatch({effects:slot.reconfigure([])});}
