/** Camera presets and render sizes. Pure data so the numbers are tested without a renderer. */
export const VIEW_PRESETS=['front','back','left','right','top','bottom','iso'] as const;
export type ViewPreset=typeof VIEW_PRESETS[number];
export const isViewPreset=(v:unknown):v is ViewPreset=>typeof v==='string'&&(VIEW_PRESETS as readonly string[]).includes(v);
/** Direction from the target to the camera. Top and bottom lean a hair toward the front so the orbit controls keep a stable up axis. */
export function viewDirection(p:ViewPreset):[number,number,number]{
 const n=(v:[number,number,number]):[number,number,number]=>{const l=Math.hypot(...v);return[v[0]/l,v[1]/l,v[2]/l];};
 switch(p){
  case 'front':return[0,0,1];case 'back':return[0,0,-1];case 'right':return[1,0,0];case 'left':return[-1,0,0];
  case 'top':return n([0,1,0.0001]);case 'bottom':return n([0,-1,0.0001]);case 'iso':return n([1,0.8,1]);
 }
}
export interface RenderSize{id:string;width:number;height:number}
export const RENDER_SIZES:readonly RenderSize[]=[
 {id:'hd',width:1280,height:720},{id:'fhd',width:1920,height:1080},{id:'uhd',width:3840,height:2160},{id:'square',width:1080,height:1080},{id:'portrait',width:1080,height:1350},
];

/** Vertical size of a 35mm full-frame sensor in millimetres; the focal length field uses it. */
export const SENSOR_HEIGHT_MM=24;
const clampFov=(f:number)=>Math.min(120,Math.max(1,f));
/** 35mm-equivalent focal length in millimetres for a vertical field of view in degrees. */
export function fovToFocal(fov:number):number{return SENSOR_HEIGHT_MM/2/Math.tan(clampFov(fov)*Math.PI/360);}
/** Vertical field of view in degrees for a 35mm-equivalent focal length in millimetres. */
export function focalToFov(mm:number):number{const m=Math.min(1400,Math.max(3,mm));return Math.min(120,Math.max(1,2*Math.atan(SENSOR_HEIGHT_MM/2/m)*180/Math.PI));}
/** Half-height of an orthographic frustum that frames like a perspective camera with the given fov at the given distance from the target. */
export function orthoHalfHeight(fov:number,distance:number):number{return Math.tan(clampFov(fov)*Math.PI/360)*Math.max(distance,1e-3);}
