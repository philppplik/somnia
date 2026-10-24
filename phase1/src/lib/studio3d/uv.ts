/** Texture transform (glTF KHR_texture_transform): offset, scale and rotation of the UV mapping. Pure, no three.js. */
export interface TextureTransform{offsetX:number;offsetY:number;scaleX:number;scaleY:number;/** Degrees, counter-clockwise, around the UV origin like glTF. */rotation:number}
export const DEFAULT_TRANSFORM:TextureTransform={offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0};
export const TRANSFORM_LIMITS={offset:{min:-100,max:100},scale:{min:0.001,max:1000},rotation:{min:-360,max:360}} as const;
export class UvError extends Error{constructor(m:string){super(m);this.name='UvError';}}
const finite=(v:unknown,what:string):number=>{if(typeof v!=='number'||!Number.isFinite(v))throw new UvError(`${what} must be a finite number.`);return v;};
const within=(v:number,min:number,max:number,what:string)=>{if(v<min||v>max)throw new UvError(`${what} must be between ${min} and ${max}.`);return v;};
/** Merges a partial change into a transform and validates the ranges. A scale of zero would collapse the texture, so it is refused. */
export function mergeTransform(base:TextureTransform,patch:Partial<TextureTransform>):TextureTransform{
 const o=TRANSFORM_LIMITS;const next={...base};
 for(const k of ['offsetX','offsetY'] as const)if(patch[k]!==undefined)next[k]=within(finite(patch[k],k),o.offset.min,o.offset.max,k);
 for(const k of ['scaleX','scaleY'] as const)if(patch[k]!==undefined){const v=finite(patch[k],k);if(Math.abs(v)<o.scale.min||Math.abs(v)>o.scale.max)throw new UvError(`${k} must have an absolute value between ${o.scale.min} and ${o.scale.max}.`);next[k]=v;}
 if(patch.rotation!==undefined)next.rotation=within(finite(patch.rotation,'rotation'),o.rotation.min,o.rotation.max,'rotation');
 return next;
}
export const isDefaultTransform=(t:TextureTransform):boolean=>t.offsetX===0&&t.offsetY===0&&t.scaleX===1&&t.scaleY===1&&t.rotation===0;
