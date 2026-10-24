/**
 * Smooth camera moves between two viewport poses (bookmarks, presets). A pose is the orbit position plus
 * the look-at target; the orientation follows the target via the orbit controls, so it is not stored.
 * Pure data and math, no three.js, so it runs under tsx --test.
 */
export interface CameraPose{position:[number,number,number];target:[number,number,number];}
/** Duration of one camera flight in milliseconds. */
export const CAMERA_FLY_MS=320;
const lerp=(a:number,b:number,u:number)=>a+(b-a)*u;
/** Interpolates between two poses. u clamps to [0,1]; easing is applied by the caller. */
export function tweenPose(from:CameraPose,to:CameraPose,u:number):CameraPose{
 const x=Math.min(1,Math.max(0,u));
 return{
  position:[lerp(from.position[0],to.position[0],x),lerp(from.position[1],to.position[1],x),lerp(from.position[2],to.position[2],x)],
  target:[lerp(from.target[0],to.target[0],x),lerp(from.target[1],to.target[1],x),lerp(from.target[2],to.target[2],x)],
 };
}
