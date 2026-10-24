/** Skeleton (skin) support: bounded checks of a glTF's skins before the loader sees the file. Pure, no three.js. */
import {ModelError} from './model';
export const MAX_SKINS=64;
export const MAX_BONES_PER_SKIN=256;
export const MAX_BONES=512;
export interface SkinStats{skins:number;bones:number}
/** Counts the joints of every skin in a glTF JSON. Throws ModelError above the limits. */
export function checkSkins(name:string,json:Record<string,unknown>):SkinStats{
 const list=json.skins;if(list===undefined)return{skins:0,bones:0};
 if(!Array.isArray(list))throw new ModelError(`${name} has a damaged skins block.`);
 if(list.length>MAX_SKINS)throw new ModelError(`${name} has ${list.length} skins; at most ${MAX_SKINS} are supported.`);
 let bones=0;
 for(const s of list){
  const joints=(s as {joints?:unknown}|null)?.joints;
  if(!Array.isArray(joints)||!joints.length)throw new ModelError(`${name} has a skin without joints.`);
  if(joints.length>MAX_BONES_PER_SKIN)throw new ModelError(`${name} has a skin with ${joints.length} bones; at most ${MAX_BONES_PER_SKIN} per skin are supported.`);
  if(!joints.every(j=>typeof j==='number'&&Number.isInteger(j)&&j>=0))throw new ModelError(`${name} has a skin with damaged joints.`);
  bones+=joints.length;
 }
 if(bones>MAX_BONES)throw new ModelError(`${name} has ${bones} bones; at most ${MAX_BONES} are supported.`);
 return{skins:list.length,bones};
}
export interface BonePickTarget{id:number;/** World position of the joint. */at:readonly[number,number,number]}
/** Click tolerance for bone picking: bones have no surface, so a click counts when the pick ray passes within this distance of a joint. Scales with the model so small rigs stay clickable. */
export function bonePickRadius(modelRadius:number):number{return Math.max(0.03,modelRadius*0.04);}
/** Nearest joint to the pick ray within maxDist, or null. dir must be normalised. Prefers the smaller distance to the ray, then the closer joint along the ray. */
export function pickBone(origin:readonly[number,number,number],dir:readonly[number,number,number],bones:readonly BonePickTarget[],maxDist:number):number|null{
 let best:number|null=null;let bestD=Infinity;let bestT=Infinity;
 for(const b of bones){
  const vx=b.at[0]-origin[0],vy=b.at[1]-origin[1],vz=b.at[2]-origin[2];
  const t=vx*dir[0]+vy*dir[1]+vz*dir[2];
  if(t<0)continue;
  const q=vx*vx+vy*vy+vz*vz-t*t;const d=q<=0?0:Math.sqrt(q);
  if(d>maxDist)continue;
  if(d<bestD-1e-9||(Math.abs(d-bestD)<=1e-9&&t<bestT)){best=b.id;bestD=d;bestT=t;}
 }
 return best;
}
