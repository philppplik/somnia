/** Auto tone and auto white balance, derived from the preview frame's pixels. No AI:
 * tone comes from luma percentiles (0.5%/99.5%) and half-window means, white balance
 * from the gray-world assumption on unclipped pixels. Every output is a plain develop
 * setting, so the engine renders the result and undo/versions/clipboard just work. */

export interface AutoTonePick {exposure:number;highlights:number;shadows:number;whites:number;blacks:number;}
export interface AutoWbPick {temp:number;tint:number;}

const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const LUMA=(r:number,g:number,b:number)=>0.2126*r+0.7152*g+0.0722*b;

interface Sample {hist:Uint32Array;count:number;lowSum:number;lowN:number;highSum:number;highN:number;rSum:number;gSum:number;bSum:number;wbN:number;}
/** Strided pass over the frame: luma histogram, low/high half sums (split at the median window midpoint later) and gray-world channel means. */
function scan(bytes:Uint8Array,w:number,h:number):Sample{
 const total=w*h,stride=Math.max(1,Math.floor(total/60000)); // cap the pass at ~60k pixels
 const s:Sample={hist:new Uint32Array(256),count:0,lowSum:0,lowN:0,highSum:0,highN:0,rSum:0,gSum:0,bSum:0,wbN:0};
 for(let p=0;p<total;p+=stride){
  const i=p*4,r=bytes[i],g=bytes[i+1],b=bytes[i+2],l=LUMA(r,g,b)|0;
  s.hist[l]++;s.count++;
  if(l<128){s.lowSum+=l;s.lowN++;}else{s.highSum+=l;s.highN++;}
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  if(l>=16&&l<=240&&mx-mn<=250){s.rSum+=r;s.gSum+=g;s.bSum+=b;s.wbN++;} // gray-world skips clipped and near-clipped pixels
 }
 return s;
}
const percentile=(hist:Uint32Array,count:number,q:number):number=>{
 const target=count*q;let acc=0;
 for(let i=0;i<256;i++){acc+=hist[i];if(acc>=target)return i;}
 return 255;
};

/** Black/white points from the 0.5th/99.5th luma percentile; exposure centers the window on mid gray. */
export function deriveAutoTone(bytes:Uint8Array,w:number,h:number):AutoTonePick{
 if(w<=0||h<=0||bytes.length<w*h*4)return{exposure:0,highlights:0,shadows:0,whites:0,blacks:0};
 const s=scan(bytes,w,h);
 if(!s.count)return{exposure:0,highlights:0,shadows:0,whites:0,blacks:0};
 const lo=percentile(s.hist,s.count,0.005),hi=percentile(s.hist,s.count,0.995);
 const mid=Math.max(1,(lo+hi)/2);
 const exposure=clamp(Math.round(Math.log2(128/mid)*20)/20,-1.5,1.5);
 // Reclaim points: deepen blacks only when the floor sits above 8, lift whites only when headroom exists below 247.
 const blacks=lo>8?-clamp(Math.round((lo/255)*60),0,50):0;
 const whites=hi<247?clamp(Math.round(((255-hi)/255)*60),0,50):0;
 // Half-window means against neutral targets (64/192): lifts a crushed low end, tames a blown high end.
 const lowMean=s.lowN?s.lowSum/s.lowN:0,highMean=s.highN?s.highSum/s.highN:255;
 const shadows=clamp(Math.round((64-lowMean)/64*45),-45,45);
 const highlights=clamp(Math.round((192-highMean)/192*45),-45,45);
 return{exposure,highlights,shadows,whites,blacks};
}

/** Gray world: unclipped pixels should average to neutral. Warm cast raises temp (cooler), green cast pushes tint toward magenta. */
export function deriveAutoWhiteBalance(bytes:Uint8Array,w:number,h:number):AutoWbPick{
 if(w<=0||h<=0||bytes.length<w*h*4)return{temp:6500,tint:0};
 const s=scan(bytes,w,h);
 if(s.wbN<8)return{temp:6500,tint:0}; // too little usable data: stay neutral rather than guess
 const mr=s.rSum/s.wbN,mg=s.gSum/s.wbN,mb=s.bSum/s.wbN;
 if(mg<1)return{temp:6500,tint:0};
 const deviation=(mr-mb)/mg; // >0 warm (red over blue), <0 cool
 const temp=clamp(Math.round((6500+deviation*4000)/50)*50,2000,50000);
 const excess=(mg-(mr+mb)/2)/mg; // >0 green over the red/blue mean
 const tint=clamp(Math.round(excess*300),-150,150); // compensate green with magenta (positive tint)
 return{temp,tint};
}
