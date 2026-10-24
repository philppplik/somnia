/** Frozen, explicitly windowed stereo-power spectrum. Not a live playback animation. */
export interface SoundAnalysis{sampleRate:48000;frames:number;fftSize:4096;window:'Hann';channelMode:'stereo-power';spectrumDb:number[];spectrumWindows:number;samplePeakDb:number|null;integratedLufs:number|null;shortTermLufs:number|null;momentaryLufs:number|null;truePeakDb:number|null;loudnessStatus:'measured-unverified'|'unavailable'|'insufficient';}
/** Linear power spectrum of one Hann-windowed frame at start (zero-padded past the end). */
function windowPower(channels:[Float32Array,Float32Array],start:number):Float64Array{
 const n=4096;if(!Number.isSafeInteger(start)||start<0)throw Error('Invalid spectrum start');const power=new Float64Array(n/2+1);
 for(const channel of channels){const real=new Float64Array(n),imag=new Float64Array(n);for(let i=0;i<n;i++){const v=channel[start+i]??0;if(!Number.isFinite(v))throw Error('Invalid analysis sample');real[i]=v*(0.5-0.5*Math.cos(2*Math.PI*i/n));}
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[real[i],real[j]]=[real[j],real[i]];}
  for(let length=2;length<=n;length*=2){const angle=-2*Math.PI/length;for(let i=0;i<n;i+=length)for(let j=0;j<length/2;j++){const c=Math.cos(angle*j),s=Math.sin(angle*j),a=i+j,b=a+length/2,tr=real[b]*c-imag[b]*s,ti=real[b]*s+imag[b]*c;real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;}}
  for(let k=0;k<power.length;k++){const scale=(k===0||k===n/2)?2/n:4/n;power[k]+=(real[k]**2+imag[k]**2)*scale**2/2;}
 }
 return power;
}
const toDb=(power:ArrayLike<number>)=>Array.from(power,p=>p>1e-14?10*Math.log10(p):-140);
export function spectrumPower(channels:[Float32Array,Float32Array],start=0):number[]{return toDb(windowPower(channels,start));}
/** Mean power spectrum over 50%-overlapping Hann windows spanning the whole render (last window zero-padded). Not a live analyser: one frozen average of the rendered PCM. */
export function spectrumPowerAverage(channels:[Float32Array,Float32Array],hop=2048):{spectrumDb:number[];windows:number}{
 const frames=channels[0].length;if(channels[1].length!==frames||frames<1)throw Error('Invalid analysis channels');if(!Number.isSafeInteger(hop)||hop<1)throw Error('Invalid spectrum hop');
 const mean=new Float64Array(4096/2+1);let windows=0;
 for(let start=0;start<frames;start+=hop){const p=windowPower(channels,start);for(let k=0;k<mean.length;k++)mean[k]+=p[k];windows++;}
 for(let k=0;k<mean.length;k++)mean[k]/=windows;
 return{spectrumDb:toDb(mean),windows};
}
export function basicAnalysis(channels:[Float32Array,Float32Array]):SoundAnalysis{if(channels[0].length!==channels[1].length||!channels[0].length)throw Error('Invalid analysis channels');let peak=0;for(const ch of channels)for(const v of ch){if(!Number.isFinite(v))throw Error('Invalid analysis samples');peak=Math.max(peak,Math.abs(v));}const{spectrumDb,windows}=spectrumPowerAverage(channels);return{sampleRate:48000,frames:channels[0].length,fftSize:4096,window:'Hann',channelMode:'stereo-power',spectrumDb,spectrumWindows:windows,samplePeakDb:peak>0?20*Math.log10(peak):null,integratedLufs:null,shortTermLufs:null,momentaryLufs:null,truePeakDb:null,loudnessStatus:channels[0].length<19200?'insufficient':'unavailable'};}
