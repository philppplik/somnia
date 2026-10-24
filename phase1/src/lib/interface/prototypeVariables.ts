import type {InterfaceDocument,InterfaceNode,PrototypeLink} from './schema';

export const MAX_LINK_SETTERS=4;
const MAX_VALUE_LENGTH=64;

function linkFor(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger']):{node:InterfaceNode;link:NonNullable<InterfaceNode['prototypeLinks']>[number]}{
 const node=doc.nodes.find(n=>n.id===nodeId);if(!node||node.locked)throw Error('Select an unlocked layer.');
 const link=node.prototypeLinks?.find(l=>l.trigger===trigger);if(!link)throw Error('Add an interaction for this trigger first.');
 return {node,link};
}
function variableFor(doc:InterfaceDocument,variableId:string):NonNullable<InterfaceDocument['variables']>[number]{
 const variable=doc.variables?.find(v=>v.id===variableId);if(!variable)throw Error('Unknown variable.');
 return variable;
}
function validateValue(type:'color'|'number',value:string):string{
 const trimmed=value.trim();if(!trimmed||trimmed.length>MAX_VALUE_LENGTH)throw Error('Enter a value (1-64 characters).');
 if(type==='number'&&!Number.isFinite(Number(trimmed)))throw Error('Number variables need a numeric value.');
 return trimmed;
}
/** Pins a link to fire only when a variable equals a fixed value; no expression language, plain string compare. */
export function setLinkCondition(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger'],variableId?:string,equals?:string):void{
 const {link}=linkFor(doc,nodeId,trigger);
 if(!variableId){delete link.condition;delete link.elseTargetFrameId;return;}
 const variable=variableFor(doc,variableId);link.condition={variableId,equals:validateValue(variable.type,equals??String(variable.value))};
}
/** Optional fallback target for when the link condition fails; must be a visible page-root frame. */
export function setLinkElseTarget(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger'],targetFrameId?:string):void{
 const {link}=linkFor(doc,nodeId,trigger);if(!link.condition)throw Error('Add a condition first.');
 if(!targetFrameId){delete link.elseTargetFrameId;return;}
 if(!doc.nodes.some(n=>n.id===targetFrameId&&n.kind==='frame'&&!n.parentId&&!n.hidden))throw Error('Select a visible page-root frame.');
 link.elseTargetFrameId=targetFrameId;
}
/** Adds a fixed setter (variable <- literal value) applied when the link fires; bounded, no scripting. */
export function addLinkSetter(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger'],variableId:string):void{
 const {link}=linkFor(doc,nodeId,trigger);const variable=variableFor(doc,variableId);
 const setters=link.setVariables??=[];if(setters.length>=MAX_LINK_SETTERS)throw Error(`Up to ${MAX_LINK_SETTERS} setters per interaction.`);
 if(setters.some(s=>s.variableId===variableId))throw Error('Variable already has a setter on this interaction.');
 setters.push({variableId,value:String(variable.value)});
}
export function setLinkSetterValue(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger'],variableId:string,value:string):void{
 const {link}=linkFor(doc,nodeId,trigger);const variable=variableFor(doc,variableId);
 const setter=link.setVariables?.find(s=>s.variableId===variableId);if(!setter)throw Error('Add the setter first.');
 setter.value=validateValue(variable.type,value);
}
export function removeLinkSetter(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger'],variableId:string):void{
 const {link}=linkFor(doc,nodeId,trigger);link.setVariables=link.setVariables?.filter(s=>s.variableId!==variableId);if(!link.setVariables?.length)delete link.setVariables;
}
