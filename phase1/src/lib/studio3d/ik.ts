/** Two-bone (limb) IK math and joint-limit helpers. Pure and node-testable (no three): everything is plain [x,y,z] vectors in world space. */
export class IkError extends Error{constructor(m:string){super(m);this.name='IkError';}}
export type Vec3=readonly[number,number,number];
export const MAX_IK_CHAINS=64;
const sub=(a:Vec3,b:Vec3):[number,number,number]=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:Vec3,b:Vec3):[number,number,number]=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a:Vec3,k:number):[number,number,number]=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):[number,number,number]=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=(a:Vec3)=>Math.hypot(a[0],a[1],a[2]);
const norm=(a:Vec3):[number,number,number]=>{const l=len(a);return l>1e-12?mul(a,1/l):[0,0,0];};
/** Rodrigues' rotation of v around a unit axis by an angle. */
export const rotateAxis=(v:Vec3,axis:Vec3,angle:number):[number,number,number]=>{
 const c=Math.cos(angle),s=Math.sin(angle),k=dot(axis,v)*(1-c);
 const cr=cross(axis,v);
 return[v[0]*c+cr[0]*s+axis[0]*k,v[1]*c+cr[1]*s+axis[1]*k,v[2]*c+cr[2]*s+axis[2]*k];
};
export interface IkSolve{/** Where the mid (elbow/knee) joint should sit. */mid:[number,number,number];/** The (possibly clamped) end position actually reached. */end:[number,number,number];/** Unit direction root to mid. */dirMid:[number,number,number];/** Unit direction mid to end. */dirEnd:[number,number,number]}
/** Analytic two-bone IK: lengths L1 (root-mid) and L2 (mid-end), target and pole in the same space as root. The reach clamps to just inside the legal annulus so the chain never fully folds or locks straight. */
export function solveTwoBone(root:Vec3,L1:number,L2:number,target:Vec3,pole:Vec3):IkSolve{
 if(!(L1>0)||!(L2>0))throw new IkError('Both bones of the chain need a length above zero.');
 const toT=sub(target,root);let d=len(toT);
 if(d<1e-9)throw new IkError('The target sits on the chain root.');
 const lo=Math.abs(L1-L2)*1.0001+1e-9,hi=(L1+L2)*0.9999;
 const dir0=norm(toT);d=Math.min(hi,Math.max(lo,d));
 // Bend plane from the pole: axis perpendicular to the root-target line and the pole direction.
 let axis=cross(dir0,norm(sub(pole,root)));
 if(len(axis)<1e-9)axis=cross(dir0,Math.abs(dir0[1])<0.99?[0,1,0]:[1,0,0]);
 axis=norm(axis);
 const cosA=Math.min(1,Math.max(-1,(L1*L1+d*d-L2*L2)/(2*L1*d)));
 const a=Math.acos(cosA);
 const dirMid=rotateAxis(dir0,axis,a) as [number,number,number];
 const end=add(root,mul(dir0,d));
 const dirEnd=norm(sub(end,add(root,mul(dirMid,L1))));
 return{mid:add(root,mul(dirMid,L1)),end,dirMid,dirEnd};
}
/** Joint limits per axis in radians; NaN means unbounded. */
export interface AxisLimits{min:Vec3;max:Vec3}
export const UNLIMITED:AxisLimits={min:[Number.NaN,Number.NaN,Number.NaN],max:[Number.NaN,Number.NaN,Number.NaN]};
export function checkLimits(min:Vec3,max:Vec3):AxisLimits{
 for(let i=0;i<3;i++){
  const lo=min[i],hi=max[i];
  if(Number.isNaN(lo)&&Number.isNaN(hi))continue;
  if(!Number.isNaN(lo)&&!Number.isNaN(hi)&&lo>hi)throw new IkError(`The lower limit of axis ${'XYZ'[i]} is above the upper limit.`);
  if(!Number.isNaN(lo)&&Math.abs(lo)>Math.PI*2)throw new IkError(`Limits beyond ±720 degrees make no sense.`);
  if(!Number.isNaN(hi)&&Math.abs(hi)>Math.PI*2)throw new IkError(`Limits beyond ±720 degrees make no sense.`);
 }
 return{min:[...min],max:[...max]};
}
/** Clamps local Euler angles (XYZ order) into the limits; NaN sides are open. */
export function clampEuler(rot:Vec3,limits:AxisLimits):[number,number,number]{
 const out=[...rot] as [number,number,number];
 for(let i=0;i<3;i++){
  if(!Number.isNaN(limits.min[i]))out[i]=Math.max(limits.min[i],out[i]);
  if(!Number.isNaN(limits.max[i]))out[i]=Math.min(limits.max[i],out[i]);
 }
 return out;
}
/** True when any side of any axis is bounded. */
export const hasLimits=(l:AxisLimits|null|undefined):l is AxisLimits=>!!l&&[...l.min,...l.max].some(v=>!Number.isNaN(v));
