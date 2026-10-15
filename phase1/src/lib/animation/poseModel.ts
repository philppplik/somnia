/** Pose library model and validation: a leaf module so document validation (model.ts) does not pull in the commands. A pose is the transform of several layers (by layer id) at one moment. */
export interface PoseLayer{layer:string;position?:readonly [number,number];scale?:readonly [number,number];rotation?:number;opacity?:number}
export interface PoseSet{id:string;name:string;layers:readonly PoseLayer[]}
export interface PoseLib{version:1;items:readonly PoseSet[]}
export const POSE_LIB_VERSION=1,MAX_POSES=30,MAX_POSE_LAYERS=100,MAX_POSE_NAME=40;
export const POSE_PROPS=['position','scale','rotation','opacity'] as const;
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const vec=(v:unknown,lo:number,hi:number)=>Array.isArray(v)&&v.length===2&&v.every(n=>num(n)&&n>=lo&&n<=hi);
export const poseId=(name:string)=>name.trim().replace(/\s+/g,' ').toLowerCase();
export function validPoseLayer(x:unknown):x is PoseLayer{
 const l=x as PoseLayer;if(!l||typeof l.layer!=='string'||!l.layer||l.layer.length>200)return false;
 if(l.position!==undefined&&!vec(l.position,-1e6,1e6))return false;if(l.scale!==undefined&&!vec(l.scale,0,10000))return false;
 if(l.rotation!==undefined&&!(num(l.rotation)&&Math.abs(l.rotation)<=36000))return false;if(l.opacity!==undefined&&!(num(l.opacity)&&l.opacity>=0&&l.opacity<=100))return false;
 return POSE_PROPS.some(k=>l[k]!==undefined);
}
export function validPose(x:unknown):x is PoseSet{
 const p=x as PoseSet;if(!p||typeof p.id!=='string'||!p.id||p.id.length>MAX_POSE_NAME||typeof p.name!=='string'||!p.name.trim()||p.name.length>MAX_POSE_NAME)return false;
 return Array.isArray(p.layers)&&p.layers.length>0&&p.layers.length<=MAX_POSE_LAYERS&&p.layers.every(validPoseLayer)&&new Set(p.layers.map(l=>l.layer)).size===p.layers.length;
}
/** Problems in a document's pose library; empty means valid (an absent library is valid). */
export function validatePoseLib(lib:unknown):string[]{
 if(lib===undefined)return [];const l=lib as Partial<PoseLib>;
 if(!l||typeof l!=='object'||l.version!==POSE_LIB_VERSION||!Array.isArray(l.items))return ['pose library has an unsupported version or shape'];
 if(l.items.length>MAX_POSES)return [`pose library has more than ${MAX_POSES} poses`];
 const ids=new Set<string>();for(const p of l.items){if(!validPose(p))return ['pose library contains an invalid pose'];if(ids.has(p.id))return ['pose library has duplicate ids'];ids.add(p.id);}
 return [];
}
