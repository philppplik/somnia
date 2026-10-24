import {getState,patchState,applyOperations,jumpToLine,clampViewport} from './appStore';
import {registerCodePanelCommands,type CodePanelActions} from '../lib/codePanels/commands';
import {commandDispatcher} from '../lib/commandDispatcher';
import {codeOutline,safeAttribute} from '../lib/codePanels/model';
import {getStudioContext} from '../lib/shell/studioContext';
export const codePanelActions:CodePanelActions={
 ready:()=>getState().activeStudio==='code',
 reveal(id){const s=getState();if(!s.coreConnected)throw Error('No editable document.');const entry=codeOutline(s.nodes,s.files[s.designFile]??'').find(n=>n.id===id);if(!entry)throw Error('Element no longer exists.');jumpToLine(s.designFile,entry.line,entry.col);patchState({selectedElementId:id,selectedElementIds:[id]});},
 attribute(id,name,value){const s=getState(),ctx=getStudioContext(),entry=codeOutline(s.nodes,s.files[s.designFile]??'').find(n=>n.id===id);if(ctx.document?.readOnly||ctx.busy||!s.coreConnected||s.activeFile!==s.designFile||!entry||entry.locked)throw Error('Element is locked or no longer editable.');if(!safeAttribute(name,value??''))throw Error('Unsafe or reserved attribute.');applyOperations([{type:'setAttribute',file:s.designFile,nodeId:id,name,value}],'canvas');},
 width(width){patchState({viewport:clampViewport(width)});}
};
export const mountCodePanelCommands=()=>registerCodePanelCommands(codePanelActions);
export async function runCodePanelCommand(id:string,params:unknown){try{await commandDispatcher.runCommand(id,params,{origin:'ui'});}catch(e){patchState({notice:e instanceof Error?e.message:String(e)});}}
