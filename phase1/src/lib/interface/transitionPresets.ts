import type {InterfaceDocument} from './model';
import type {PrototypeLink,PrototypeTransition} from './schema';

export type TransitionPresetName='instant'|'dissolve'|'slide'|'push'|'smart-animate';
/** One-click transition presets per link: full kind+duration+easing tuples, applied as one edit. */
export const TRANSITION_PRESETS:Record<TransitionPresetName,PrototypeTransition|undefined>={
 instant:undefined,
 dissolve:{kind:'dissolve',durationMs:200,easing:'ease'},
 slide:{kind:'slide',durationMs:300,easing:'ease-out',direction:'left'},
 push:{kind:'push',durationMs:300,easing:'ease-out',direction:'left'},
 'smart-animate':{kind:'smart-animate',durationMs:300,easing:'ease-in-out'},
};
export function applyLinkTransitionPreset(doc:InterfaceDocument,nodeId:string,trigger:PrototypeLink['trigger'],preset:TransitionPresetName):void{
 const node=doc.nodes.find(n=>n.id===nodeId);if(!node||node.locked)throw Error('Select an unlocked layer.');
 const link=node.prototypeLinks?.find(l=>l.trigger===trigger);if(!link)throw Error('Add an interaction for this trigger first.');
 const transition=TRANSITION_PRESETS[preset];
 if(transition)link.transition={...transition};else delete link.transition;
}
