import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateHorizon} from './autoStraighten';
/** Sky over ground, the boundary tilted by `tiltDeg` (positive = sloping down to the right, screen coords). */
const horizon=(w:number,h:number,tiltDeg:number)=>{
 const SS=4,W=w*SS,H=h*SS,t=Math.tan(tiltDeg*Math.PI/180); // supersampled, then box-downsampled: a truly antialiased edge
 const b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let acc=0;
  for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){
   const X=x*SS+sx,Y=y*SS+sy;
   acc+=Y<H/2+(X-W/2)*t?200:80;
  }
  const v=Math.round(acc/(SS*SS));
  const i=(y*w+x)*4;b[i]=v;b[i+1]=v;b[i+2]=v;b[i+3]=255;
 }
 return b;
};
test('a horizon sloping down to the right takes the negative correction',()=>{
 const a=estimateHorizon(horizon(128,96,5),128,96);
 assert.ok(a!==null&&Math.abs(a+5)<=1,`expected about -5 (+/-1 from the pixel grid), got ${a}`);
});
test('a horizon sloping up to the right takes the positive correction',()=>{
 const a=estimateHorizon(horizon(128,96,-8),128,96);
 assert.ok(a!==null&&Math.abs(a-8)<=1,`expected about +8 (+/-1 from the pixel grid), got ${a}`);
});
test('a level horizon estimates zero and keeps the -0 normalization',()=>{
 const a=estimateHorizon(horizon(128,96,0),128,96);
 assert.equal(a,0);
});
test('flat frames, pure vertical structure and bad input stay silent',()=>{
 const flat=new Uint8Array(64*64*4).fill(128);
 assert.equal(estimateHorizon(flat,64,64),null);
 const stripes=new Uint8Array(96*96*4);
 for(let y=0;y<96;y++)for(let x=0;x<96;x++){const v=x<48?200:80;const i=(y*96+x)*4;stripes[i]=v;stripes[i+1]=v;stripes[i+2]=v;stripes[i+3]=255;}
 assert.equal(estimateHorizon(stripes,96,96),null); // vertical edge: no horizon
 assert.equal(estimateHorizon(new Uint8Array(4),1,1),null);
});
test('texture noise without a dominant edge stays silent',()=>{
 const n=128,b=new Uint8Array(n*n*4);
 let seed=42;const rnd=()=>((seed=seed*1103515245+12345>>>0)/2**32);
 for(let p=0;p<n*n;p++){const v=Math.floor(rnd()*256);b[p*4]=v;b[p*4+1]=v;b[p*4+2]=v;b[p*4+3]=255;}
 assert.equal(estimateHorizon(b,n,n),null);
});
