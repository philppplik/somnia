import type {PhotoCrop} from './studioSettings';
export interface CropGuideLines{vertical:number[];horizontal:number[];}
export type CropGuideStyle='thirds'|'golden'|'center';
export const CROP_GUIDE_STYLES:CropGuideStyle[]=['thirds','golden','center'];
/** Guide positions inside a crop rect, in normalized image coordinates (0..1): thirds by default, golden-section or a center cross on request. */
export function cropGuideLines(crop:PhotoCrop,style:CropGuideStyle='thirds'):CropGuideLines{
 const x0=Math.min(crop.x0,crop.x1),x1=Math.max(crop.x0,crop.x1);
 const y0=Math.min(crop.y0,crop.y1),y1=Math.max(crop.y0,crop.y1);
 const at=(a:number,b:number,f:number)=>a+(b-a)*f;
 if(style==='golden'){const g=(3-Math.sqrt(5))/2;return{vertical:[at(x0,x1,g),at(x0,x1,1-g)],horizontal:[at(y0,y1,g),at(y0,y1,1-g)]};}
 if(style==='center')return{vertical:[at(x0,x1,0.5)],horizontal:[at(y0,y1,0.5)]};
 return{vertical:[at(x0,x1,1/3),at(x0,x1,2/3)],horizontal:[at(y0,y1,1/3),at(y0,y1,2/3)]};
}
