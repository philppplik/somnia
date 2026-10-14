/** Auto straighten: horizon estimate from the preview frame's gradient structure tensor. Classical CV,
 * no AI: accumulate gx^2, gx*gy, gy^2 over structured pixels; a single dominant orientation (eigenvalue
 * coherence gate) near horizontal (within +-15 deg) becomes the straighten correction. Null when the
 * frame has no usable structure, no dominant orientation, or no near-horizontal edge - the caller
 * leaves the setting alone rather than guess. */
export const AUTO_STRAIGHTEN_MAX=15;
const LUMA=(r:number,g:number,b:number)=>0.2126*r+0.7152*g+0.0722*b;
export function estimateHorizon(bytes:Uint8Array,w:number,h:number):number|null{
 if(w<8||h<8||bytes.length<w*h*4)return null;
 const stride=Math.max(1,Math.floor((w*h)/40000));
 let jxx=0,jxy=0,jyy=0;
 const l=(x:number,y:number)=>{const i=(y*w+x)*4;return LUMA(bytes[i],bytes[i+1],bytes[i+2]);};
 for(let y=Math.max(1,stride);y<h-1;y+=stride)for(let x=Math.max(1,stride);x<w-1;x+=stride){
  const gx=l(x+1,y-1)+2*l(x+1,y)+l(x+1,y+1)-l(x-1,y-1)-2*l(x-1,y)-l(x-1,y+1); // Sobel: smooths across the edge, so a tilted step reads as its true normal
  const gy=l(x-1,y+1)+2*l(x,y+1)+l(x+1,y+1)-l(x-1,y-1)-2*l(x,y-1)-l(x+1,y-1);
  if(gx*gx+gy*gy<2304)continue; // flat areas vote nothing (Sobel scale: a full step is ~480)
  jxx+=gx*gx;jxy+=gx*gy;jyy+=gy*gy;
 }
 const tr=jxx+jyy;if(tr<=0)return null;
 const disc=Math.sqrt(Math.max(0,((jxx-jyy)/2)**2+jxy*jxy));
 const l1=tr/2+disc,l2=tr/2-disc;
 if(l1<=0||(l1-l2)/(l1+l2)<0.6)return null; // several edge directions: no dominant horizon
 let a=0.5*Math.atan2(2*jxy,jxx-jyy)*180/Math.PI+90; // dominant edge orientation, perpendicular to the dominant gradient
 while(a>=90)a-=180;while(a<-90)a+=180;
 if(Math.abs(a)>AUTO_STRAIGHTEN_MAX)return null; // vertical structures are not horizons
 const deg=Math.round(-a*10)/10||0; // a horizon sloping down to the right takes the negative correction, like straightenAngle; normalize -0
 return Math.min(45,Math.max(-45,deg));
}
