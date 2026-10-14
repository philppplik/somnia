import type {InterfaceDocument} from './model';
export interface InterfaceGesture {id:string;revision:number;startX:number;startY:number;x:number;y:number;width:number;height:number;dx:number;dy:number;resize:boolean;}
/** Canvas preview never writes source. Commit is one draft mutation, rejected if its revision is stale. */
export function applyInterfaceGesture(doc:InterfaceDocument,gesture:InterfaceGesture):boolean{
 if(doc.revision!==gesture.revision)return false;const node=doc.nodes.find(n=>n.id===gesture.id);if(!node||node.locked)return false;
 if(gesture.resize){node.width=Math.max(1,gesture.width+gesture.dx);node.height=Math.max(1,gesture.height+gesture.dy);}else{node.x=gesture.x+gesture.dx;node.y=gesture.y+gesture.dy;}
 return true;
}
