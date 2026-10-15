/** Waveform peaks: min/max amplitude buckets per source, computed once in the filmstrip worker, drawn per clip. Pure math lives here - no DOM, no mediabunny. */

/** Peaks are stored as interleaved [min,max] pairs. */
export const WAVEFORM_MAX_BUCKETS=6000;
/** One bucket per ~50 ms of source, capped so very long files stay cheap. */
export const bucketCountFor=(duration:number)=>!(duration>0)?0:Math.min(WAVEFORM_MAX_BUCKETS,Math.max(1,Math.ceil(duration/0.05)));

/**
 * Maps a clip's source range onto `widthPx` screen columns: for each column the [min,max] amplitude of the buckets
 * whose time the column covers. Columns without coverage stay 0 (flat line). Gain scales the display, clamped to [-1,1].
 */
export function slicePeaks(peaks:Float32Array,duration:number,in_s:number,out_s:number,widthPx:number,gain=1):Float32Array{
 const out=new Float32Array(Math.max(0,widthPx)*2);
 const buckets=peaks.length/2;
 if(!buckets||!(duration>0)||!(out_s>in_s)||widthPx<1)return out;
 const step=duration/buckets;
 const g=Math.max(0,gain);
 for(let x=0;x<widthPx;x++){
  const t0=in_s+(x/widthPx)*(out_s-in_s),t1=in_s+((x+1)/widthPx)*(out_s-in_s);
  const b0=Math.max(0,Math.floor(t0/step)),b1=Math.min(buckets-1,Math.floor((t1-1e-9)/step));
  let lo=0,hi=0;
  for(let b=b0;b<=b1;b++){const mn=peaks[b*2],mx=peaks[b*2+1];if(b===b0||mn<lo)lo=mn;if(b===b0||mx>hi)hi=mx;}
  out[x*2]=Math.max(-1,lo*g);out[x*2+1]=Math.min(1,hi*g);
 }
 return out;
}
