import {yCollab} from 'y-codemirror.next';
import {Compartment} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {collabEnabled} from './flag';
import {getCollab} from './session';
import {isCollabFile} from './paths';
/** Bind the code editor to the shared text of `file` (HTML only, flag on, session running). Returns false when nothing was bound.
 * The editor document is first set to the shared text so both sides start equal, then y-codemirror.next keeps them in sync.
 * Local typing, remote typing and design-view edits all end up in the same Y.Text. */
export function attachCollab(view:EditorView,slot:Compartment,file:string):boolean{
 const c=getCollab();
 if(!c||!collabEnabled()||!isCollabFile(file)){detachCollab(view,slot);return false;}
 const ytext=c.text(file,view.state.doc.toString());
 const shared=ytext.toString();
 if(view.state.doc.toString()!==shared)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:shared}});
 view.dispatch({effects:slot.reconfigure(yCollab(ytext,c.awareness))});
 return true;
}
export function detachCollab(view:EditorView,slot:Compartment){view.dispatch({effects:slot.reconfigure([])});}
