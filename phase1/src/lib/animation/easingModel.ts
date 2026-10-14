/** Named easing presets stored in a document: a leaf module so document validation (model.ts) stays light. */
export type Handle2=readonly [number,number];
/** A cubic-bezier easing: `out` and `in` are the two control points of the segment that starts at a key. */
export interface EasingSet{id:string;name:string;out:Handle2;in:Handle2}
export interface EasingLib{version:1;items:readonly EasingSet[]}
export const EASING_LIB_VERSION=1,MAX_EASINGS=50,EASE_X_MIN=0,EASE_X_MAX=1,EASE_Y_LOW=-2,EASE_Y_HIGH=3;
const num=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export const validHandle=(h:unknown):h is Handle2=>Array.isArray(h)&&h.length===2&&num(h[0])&&num(h[1])&&h[0]>=EASE_X_MIN&&h[0]<=EASE_X_MAX&&h[1]>=EASE_Y_LOW&&h[1]<=EASE_Y_HIGH;
export function validEasing(x:unknown):x is EasingSet{
 const e=x as EasingSet;return !!e&&typeof e.id==='string'&&!!e.id&&e.id.length<=64&&typeof e.name==='string'&&!!e.name.trim()&&e.name.length<=40&&validHandle(e.out)&&validHandle(e.in);
}
export function validateEasingLib(lib:unknown):string[]{
 if(lib===undefined)return [];const l=lib as Partial<EasingLib>;
 if(!l||typeof l!=='object'||l.version!==EASING_LIB_VERSION||!Array.isArray(l.items))return ['easing library has an unsupported version or shape'];
 if(l.items.length>MAX_EASINGS)return [`easing library has more than ${MAX_EASINGS} presets`];
 const ids=new Set<string>(),names=new Set<string>();
 for(const e of l.items){if(!validEasing(e))return ['easing library contains an invalid preset'];if(ids.has(e.id)||names.has(e.name.trim()))return ['easing library has duplicate ids or names'];ids.add(e.id);names.add(e.name.trim());}
 return [];
}
