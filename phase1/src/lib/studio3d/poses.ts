/** Pose library math: capture, mirror and blend of bone-local transforms. Pure and node-testable (no three). */
export class PoseError extends Error{constructor(m:string){super(m);this.name='PoseError';}}
/** Local transform of one bone: position, quaternion (x,y,z,w), scale. */
export interface PoseBone{p:readonly[number,number,number];q:readonly[number,number,number,number];s:readonly[number,number,number]}
/** A named pose: bone-local transforms keyed by bone name. */
export interface Pose{name:string;bones:Record<string,PoseBone>}
export const MAX_POSES=64,MAX_POSE_NAME=80;
export function checkPoseName(name:string,existing:readonly string[]):string{
 const n=(name??'').trim();
 if(!n)throw new PoseError('Give the pose a name.');
 if(n.length>MAX_POSE_NAME)throw new PoseError(`Pose names are at most ${MAX_POSE_NAME} characters.`);
 if(existing.includes(n))throw new PoseError(`There already is a pose named "${n}".`);
 return n;
}
/** The L/R partner of a bone name, or null when no convention matches. Covers suffixes (Arm.L, arm_l) and words (LeftArm, left hand). */
export function mirrorBoneName(name:string):string|null{
 const patterns:[RegExp,string][]=[
  [/\.L$/,'.R'],[/\.R$/,'.L'],[/\.l$/,'.r'],[/\.r$/,'.l'],
  [/_L$/,'_R'],[/_R$/,'_L'],[/_l$/,'_r'],[/_r$/,'_l'],
  [/Left/,'Right'],[/Right/,'Left'],
  [/left/,'right'],[/right/,'left'],
  [/LEFT/,'RIGHT'],[/RIGHT/,'LEFT'],
 ];
 for(const[re,to]of patterns)if(re.test(name))return name.replace(re,to);
 return null;
}
/** Swaps the stored local transforms between L/R name pairs; unpaired bones keep theirs. */
export function mirrorPose(pose:Pose):Pose{
 const bones:Record<string,PoseBone>={};
 for(const[n,b]of Object.entries(pose.bones)){
  const m=mirrorBoneName(n);
  bones[n]=m&&pose.bones[m]?pose.bones[m]:b;
 }
 return{name:pose.name,bones};
}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Shortest-arc slerp of two quaternions (x,y,z,w arrays). */
export function slerpQ(a:readonly[number,number,number,number],b:readonly[number,number,number,number],t:number):[number,number,number,number]{
 let[ax,ay,az,aw]=a,[bx,by,bz,bw]=b;
 let cos=ax*bx+ay*by+az*bz+aw*bw;
 if(cos<0){cos=-cos;bx=-bx;by=-by;bz=-bz;bw=-bw;}
 let k0:number,k1:number;
 if(cos>0.9995){k0=1-t;k1=t;}
 else{const th=Math.acos(Math.min(1,cos));const s=Math.sin(th);k0=Math.sin((1-t)*th)/s;k1=Math.sin(t*th)/s;}
 return[ax*k0+bx*k1,ay*k0+by*k1,az*k0+bz*k1,aw*k0+bw*k1];
}
/** Blends two poses: bones present in both interpolate, bones present in only one are kept as-is. t clamps to 0..1. */
export function blendPoses(a:Pose,b:Pose,t:number):Pose{
 const k=Math.min(1,Math.max(0,Number.isFinite(t)?t:0));
 const bones:Record<string,PoseBone>={};
 const names=new Set([...Object.keys(a.bones),...Object.keys(b.bones)]);
 for(const n of names){
  const x=a.bones[n],y=b.bones[n];
  if(x&&y)bones[n]={p:[lerp(x.p[0],y.p[0],k),lerp(x.p[1],y.p[1],k),lerp(x.p[2],y.p[2],k)],q:slerpQ(x.q,y.q,k),s:[lerp(x.s[0],y.s[0],k),lerp(x.s[1],y.s[1],k),lerp(x.s[2],y.s[2],k)]};
  else bones[n]=x??y;
 }
 return{name:a.name,bones};
}
