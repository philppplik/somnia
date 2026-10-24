import {editDesign,getDesignState,selectArtboard,selectDesignNodes} from './session';
import {addArtboard,deleteArtboard,duplicateArtboard,moveArtboard,nudgeNodes,renameArtboard,resizeArtboard,restack,setArtboardBackground,swapArtboardOrientation,type StackMove} from './artboards';
/** Session-level actions: each one is exactly one undo step (or none when it does nothing). */
export function addBoard(opts?:Parameters<typeof addArtboard>[1]):string|null{
 const s=getDesignState();if(!s.document)return null;const r=addArtboard(s.document,opts);if(!r.id)return null;
 editDesign(()=>r.doc);selectArtboard(r.id);return r.id;
}
export function duplicateBoard(id?:string):string|null{
 const s=getDesignState();const target=id??s.artboardId;if(!s.document||!target)return null;const r=duplicateArtboard(s.document,target);if(!r.id)return null;
 editDesign(()=>r.doc);selectArtboard(r.id);return r.id;
}
export function deleteBoard(id?:string):boolean{
 const s=getDesignState();const target=id??s.artboardId;if(!s.document||!target)return false;const r=deleteArtboard(s.document,target);if(!r.next)return false;
 editDesign(()=>r.doc);selectArtboard(r.next);return true;
}
export function renameBoard(id:string,name:string){editDesign(d=>renameArtboard(d,id,name));}
export function moveBoard(id:string,direction:1|-1){editDesign(d=>moveArtboard(d,id,direction));}
export function resizeBoard(id:string,width:number,height:number){editDesign(d=>resizeArtboard(d,id,width,height));}
export function rotateBoard(id:string){editDesign(d=>swapArtboardOrientation(d,id));}
export function setBoardBackground(id:string,color:string){editDesign(d=>setArtboardBackground(d,id,color));}
export function restackSelection(move:StackMove){
 const {artboardId,selectedIds}=getDesignState();if(!selectedIds.length)return;
 editDesign(d=>({...d,artboards:d.artboards.map(a=>a.id===artboardId?{...a,nodes:restack(a.nodes,selectedIds,move)}:a)}));
}
export function nudgeSelection(dx:number,dy:number){
 const {artboardId,selectedIds}=getDesignState();if(!selectedIds.length)return;
 editDesign(d=>({...d,artboards:d.artboards.map(a=>a.id===artboardId?{...a,nodes:nudgeNodes(a.nodes,selectedIds,dx,dy)}:a)}));
}
export function selectAllLayers(){
 const s=getDesignState();const a=s.document?.artboards.find(x=>x.id===s.artboardId);if(!a)return;
 selectDesignNodes(a.nodes.filter(n=>!n.hidden&&!n.locked).map(n=>n.id));
}
