import type {InterfaceDocument} from './schema';
/** Only local instant navigation. Imported metadata never becomes a command or URL. */
export function validateInterfacePrototype(doc:InterfaceDocument){
 const frames=new Map(doc.nodes.filter(n=>n.kind==='frame'&&!n.parentId).map(n=>[n.id,n]));
 if(doc.prototypeStartFrameId!==undefined&&(typeof doc.prototypeStartFrameId!=='string'||!frames.has(doc.prototypeStartFrameId)||frames.get(doc.prototypeStartFrameId)!.hidden))throw Error('Invalid prototype start frame.');let count=0;
 for(const n of doc.nodes){if(n.prototypeLinks===undefined)continue;if(!Array.isArray(n.prototypeLinks)||n.prototypeLinks.length>2)throw Error('Invalid prototype links.');const triggers=new Set<string>();for(const l of n.prototypeLinks){if(!l||typeof l!=='object'||Object.keys(l).some(k=>!['trigger','targetFrameId'].includes(k))||!['click','hover'].includes(l.trigger)||triggers.has(l.trigger)||typeof l.targetFrameId!=='string'||!frames.has(l.targetFrameId)||frames.get(l.targetFrameId)!.hidden)throw Error('Invalid prototype link target or trigger.');triggers.add(l.trigger);if(++count>500)throw Error('Prototype link budget exceeded.');}}
}
