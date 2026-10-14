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
