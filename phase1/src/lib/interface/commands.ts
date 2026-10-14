import {registerCommandScope,commandRegistry} from '../commandRegistry';
import {getStudioContext} from '../shell/studioContext';
import {registerCommandSpec} from '../commandBridge';
import {addNode,deleteNode} from './model';
import {interfaceSession,startInterface} from './session';
import {saveInterfaceSnapshot} from './persistence';
import type {CommandCategory} from '../commandSpec';
export const INTERFACE_COMMANDS=['interface.new','interface.save','interface.undo','interface.redo','interface.addFrame','interface.addRectangle','interface.addText','interface.delete'] as const;
export function insertInterfaceNode(kind:'frame'|'rectangle'|'text'){
 const s=interfaceSession.get();if(!s.document||!s.pageId)return;let id='';
 const selected=s.document.nodes.find(n=>n.id===s.selection);const parent=kind!=='frame'&&selected?.kind==='frame'&&!selected.locked?selected.id:null;
 interfaceSession.transact(d=>{id=addNode(d,s.pageId!,kind,parent);});interfaceSession.select(id);
}
export function registerInterfaceCommands(){
 const state=interfaceSession.get;
 const specs:[string,CommandCategory,()=>unknown,()=>boolean][]=[
 ['new','Project',startInterface,()=>true],['save','Project',saveInterfaceSnapshot,()=>!!state().document],
 ['undo','Edit',()=>interfaceSession.undo(),()=>!!state().past.length],['redo','Edit',()=>interfaceSession.redo(),()=>!!state().future.length],
 ['addFrame','Insert',()=>insertInterfaceNode('frame'),()=>!!state().document],['addRectangle','Insert',()=>insertInterfaceNode('rectangle'),()=>!!state().document],['addText','Insert',()=>insertInterfaceNode('text'),()=>!!state().document],
 ['delete','Edit',()=>interfaceSession.transact(d=>{if(state().selection)deleteNode(d,state().selection!);}),()=>!!state().selection&&!state().document?.nodes.find(n=>n.id===state().selection)?.locked],
 ];
 const offs=specs.map(([id,category,run,enabled])=>registerCommandSpec({id:`interface.${id}`,title:`Interface: ${id}`,category,level:'ui',enabled,run}));const routes:Record<string,string>={'project.save':'interface.save','edit.undo':'interface.undo','edit.redo':'interface.redo','edit.delete':'interface.delete'};offs.push(registerCommandScope(id=>getStudioContext().studio==='interface'&&routes[id]?commandRegistry.get(routes[id]):undefined));return()=>offs.forEach(off=>off());
}
