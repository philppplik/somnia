import {patchInterfaceNode} from './components';
import {DEFAULT_SIZING} from './schema';
import type {InterfaceDocument} from './model';
export interface InterfaceGesture {id:string;revision:number;startX:number;startY:number;x:number;y:number;width:number;height:number;dx:number;dy:number;resize:boolean;}
/** Canvas preview never writes source. Commit is one draft mutation, rejected if its revision is stale. */
export function applyInterfaceGesture(doc:InterfaceDocument,gesture:InterfaceGesture):boolean{
 if(doc.revision!==gesture.revision)return false;const node=doc.nodes.find(n=>n.id===gesture.id);if(!node||node.locked)return false;
 if(gesture.resize){patchInterfaceNode(doc,node.id,{width:Math.max(1,gesture.width+gesture.dx),height:Math.max(1,gesture.height+gesture.dy)});if(!node.instance)node.sizing={...DEFAULT_SIZING,...node.sizing,width:'fixed',height:'fixed'};}else{patchInterfaceNode(doc,node.id,{x:gesture.x+gesture.dx,y:gesture.y+gesture.dy});}
 return true;
}
