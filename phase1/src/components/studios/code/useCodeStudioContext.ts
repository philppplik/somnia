import {useEffect,useRef} from 'react';
import {useAppStore} from '../../../store/appStore';
import {useUiContext} from '../../../lib/uiContextStore';
import {studioContextStore} from '../../../lib/shell/studioContext';
/** Claims only the Code canvas, with an owner token that cannot overwrite another studio. */
export function useCodeStudioContext(){
 const s=useAppStore(),ui=useUiContext();const owner=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 useEffect(()=>{if(s.activeStudio!=='code')return;const claim=studioContextStore.claim('code',s.activeFile?{id:s.activeFile,kind:s.activeFile.split('.').pop()??'txt',dirty:s.isDirty,readOnly:ui.flags.readonly}:undefined);owner.current=claim;return()=>{claim.release();if(owner.current===claim)owner.current=null;};},[s.activeStudio,s.activeFile]);
 useEffect(()=>{const ids=ui.selection.kind==='multi'?s.selectedElementIds:ui.nodeId?[ui.nodeId]:[];owner.current?.report({mode:s.viewMode,document:s.activeFile?{id:s.activeFile,kind:s.activeFile.split('.').pop()??'txt',dirty:s.isDirty,readOnly:ui.flags.readonly}:undefined,selection:{kind:ids.length>1?'many':ids.length===1?'one':'none',count:ids.length,ids,type:ui.selection.kind},activeTool:ui.activeTool??undefined,busy:false,services:{core:s.coreConnected,disk:s.nativeConnected},data:{domain:ui.domain,locked:ui.flags.locked,viewport:s.viewport}});},[s.activeStudio,s.activeFile,s.isDirty,s.viewMode,s.selectedElementIds,s.coreConnected,s.nativeConnected,s.viewport,ui]);
}
