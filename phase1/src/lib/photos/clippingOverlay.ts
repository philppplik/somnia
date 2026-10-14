import {CLIP_LOW,CLIP_HIGH,lumaOf} from './histogram';
export interface PhotoFrameLike{bytes:ArrayBuffer;width:number;height:number;}
/** False-color used for clipped shadow pixels (blue), RGB. */
export const CLIPPING_SHADOW:[number,number,number]=[32,96,255];
/** False-color used for clipped highlight pixels (red), RGB. */
export const CLIPPING_HIGHLIGHT:[number,number,number]=[255,48,32];
/**
 * Per-pixel false-color overlay for a rendered preview frame: shadow-clipped pixels (luma <= CLIP_LOW)
 * become solid blue, highlight-clipped pixels (luma >= CLIP_HIGH) solid red, everything else transparent.
 * Same thresholds and luma as the histogram panel, so the overlay matches its clipping numbers.
 */
export function clippingOverlayImage(frame:PhotoFrameLike):PhotoFrameLike{
 const src=new Uint8Array(frame.bytes);
 const out=new Uint8ClampedArray(frame.width*frame.height*4);
 const pixels=frame.width*frame.height;
 for(let p=0;p<pixels;p++){
  const o=p*4;if(src[o+3]===0)continue;
  const y=lumaOf(src[o],src[o+1],src[o+2]);
  if(y<=CLIP_LOW){out[o]=CLIPPING_SHADOW[0];out[o+1]=CLIPPING_SHADOW[1];out[o+2]=CLIPPING_SHADOW[2];out[o+3]=255;}
  else if(y>=CLIP_HIGH){out[o]=CLIPPING_HIGHLIGHT[0];out[o+1]=CLIPPING_HIGHLIGHT[1];out[o+2]=CLIPPING_HIGHLIGHT[2];out[o+3]=255;}
 }
 return{bytes:out.buffer as ArrayBuffer,width:frame.width,height:frame.height};
}
