import {patchInterfaceNode} from './components';
import {computeInterfaceLayout} from './layout';
import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument} from './model';
import {DEFAULT_SIZING} from './schema';
export interface InterfaceFrameSize {width:number;height:number;}
export function validateInterfaceFrameSize(size:InterfaceFrameSize):InterfaceFrameSize{const width=Math.round(size.width),height=Math.round(size.height);if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>32768||height>32768)throw Error('Invalid frame size.');return {width,height};}
/** Committing a preset size is a normal patch so it joins history as one undoable transaction. */
export function resizeInterfaceFrame(doc:InterfaceDocument,id:string,size:InterfaceFrameSize){const n=doc.nodes.find(n=>n.id===id);if(!n||n.kind!=='frame')throw Error('Select a frame layer.');const {width,height}=validateInterfaceFrameSize(size);patchInterfaceNode(doc,id,{width,height});if(!n.instance)n.sizing={...DEFAULT_SIZING,...n.sizing,width:'fixed',height:'fixed'};}
/** Responsive preview computes rendered bounds on an isolated copy; the source document, history and recovery stay untouched. */
export function previewInterfaceFrameSize(doc:InterfaceDocument,id:string,size:InterfaceFrameSize){validateInterfaceFrameSize(size);const copy=parseInterfaceDocument(serializeInterfaceDocument(doc));resizeInterfaceFrame(copy,id,size);return computeInterfaceLayout(copy);}
export interface ReflowChange {id:string;name:string;from:{x:number;y:number;width:number;height:number};to:{x:number;y:number;width:number;height:number};}
export const MAX_REFLOW_CHANGES=8;
/** Direct-child rendered-bounds diff between the current layout and a candidate frame size; makes reflow visible without touching the document. */
export function diffInterfaceReflow(doc:InterfaceDocument,id:string,size:InterfaceFrameSize,cap=MAX_REFLOW_CHANGES):ReflowChange[]{
 validateInterfaceFrameSize(size);const frame=doc.nodes.find(n=>n.id===id);if(!frame||frame.kind!=='frame')throw Error('Select a frame layer.');
 const before=computeInterfaceLayout(doc),after=previewInterfaceFrameSize(doc,id,size);const out:ReflowChange[]=[];
 const rect=(map:Map<string,{x:number;y:number;width:number;height:number}>,key:string)=>({x:Math.round(map.get(key)?.x??0),y:Math.round(map.get(key)?.y??0),width:Math.round(map.get(key)?.width??0),height:Math.round(map.get(key)?.height??0)});
 for(const childId of frame.children){const child=doc.nodes.find(n=>n.id===childId);if(!child||child.hidden)continue;const from=rect(before.bounds,childId),to=rect(after.bounds,childId);if(from.x===to.x&&from.y===to.y&&from.width===to.width&&from.height===to.height)continue;out.push({id:childId,name:child.name,from,to});if(out.length>=cap)break;}
 return out;
}
/** Min/max sizing edits validate against the sibling limit so a layer can never end up with min > max. */
export function setInterfaceSizingLimit(doc:InterfaceDocument,id:string,key:'minWidth'|'maxWidth'|'minHeight'|'maxHeight',value:number){
 const n=doc.nodes.find(n=>n.id===id);if(!n||n.locked)throw Error('Select an unlocked layer.');
 if(!Number.isFinite(value)||value<0||value>32768)throw Error('Enter a size between 0 and 32768.');
 const sizing={...DEFAULT_SIZING,...n.sizing,[key]:Math.round(value)};
 if(sizing.minWidth>sizing.maxWidth||sizing.minHeight>sizing.maxHeight)throw Error('Minimum sizes must stay at or below maximum sizes.');
 patchInterfaceNode(doc,id,{sizing});
}
