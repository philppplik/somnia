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
