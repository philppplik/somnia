import type {PhotoCrop} from './studioSettings';
export interface CropGuideLines{vertical:[number,number];horizontal:[number,number];}
/** Rule-of-thirds guide positions inside a crop rect, in normalized image coordinates (0..1). */
export function cropGuideLines(crop:PhotoCrop):CropGuideLines{
 const x0=Math.min(crop.x0,crop.x1),x1=Math.max(crop.x0,crop.x1);
 const y0=Math.min(crop.y0,crop.y1),y1=Math.max(crop.y0,crop.y1);
 return{vertical:[x0+(x1-x0)/3,x0+(2*(x1-x0))/3],horizontal:[y0+(y1-y0)/3,y0+(2*(y1-y0))/3]};
}
