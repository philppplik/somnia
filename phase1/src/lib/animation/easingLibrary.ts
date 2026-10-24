import {EASE_PRESETS} from './graph';
import {newId,type AnimationDocument} from './model';
import type {Edit} from './edit';
import {MAX_EASINGS,validEasing,validHandle,type EasingSet,type Handle2} from './easingModel';
export type {EasingSet} from './easingModel';
export {MAX_EASINGS,EASING_LIB_VERSION,validEasing,validHandle,validateEasingLib} from './easingModel';
export const userEasings=(doc:AnimationDocument|null|undefined):readonly EasingSet[]=>doc?.easings?.items??[];
export const findEasing=(doc:AnimationDocument|null|undefined,id:string)=>userEasings(doc).find(e=>e.id===id);
const edit=(items:readonly EasingSet[]):Edit=>({type:'easings.set',items:items.map(e=>({id:e.id,name:e.name.trim(),out:e.out,in:e.in}))});
const BUILTIN_NAMES=new Set(Object.keys(EASE_PRESETS));
/** Edit that adds a named easing. Refuses invalid handles, duplicate or built-in names and a full library. */
export function saveEasingEdit(doc:AnimationDocument,name:string,out:Handle2,inn:Handle2):Edit{
 const n=name.trim();if(!n||n.length>40)throw Error('Name must be 1 to 40 characters.');
 if(!validHandle(out)||!validHandle(inn))throw Error('Handles need x between 0 and 1 and y between -2 and 3.');
 const items=userEasings(doc);if(items.some(e=>e.name===n)||BUILTIN_NAMES.has(n))throw Error('An easing with this name already exists.');
 if(items.length>=MAX_EASINGS)throw Error(`At most ${MAX_EASINGS} saved easings.`);
 const e:EasingSet={id:newId('ease'),name:n,out,in:inn};if(!validEasing(e))throw Error('This easing is not valid.');return edit([...items,e]);
}
export function deleteEasingEdit(doc:AnimationDocument,id:string):Edit{
 const items=userEasings(doc);if(!items.some(e=>e.id===id))throw Error('Easing no longer exists.');return edit(items.filter(e=>e.id!==id));
}
