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
