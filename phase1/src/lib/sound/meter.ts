/** Live playback metering: peak of one analyser frame and a smoothed meter level with fast attack and slow release. */
export const meterPeak=(samples:Float32Array)=>{let peak=0;for(let i=0;i<samples.length;i++){const v=Math.abs(samples[i]);if(v>peak)peak=v;}return peak;};
export const meterLevel=(previous:number,samples:Float32Array,attack=0.6,release=0.12)=>{const peak=meterPeak(samples);return previous+(peak-previous)*(peak>previous?attack:release);};
export const meterDb=(level:number)=>level>0?20*Math.log10(level):-Infinity;
/** Bar fill 0..1 for a dB scale from -60 to 0. */
export const meterFill=(level:number)=>{const db=meterDb(level);return db===-Infinity?0:Math.min(1,Math.max(0,(db+60)/60));};
