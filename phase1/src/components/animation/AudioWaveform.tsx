import {visiblePeaks} from '../../lib/animation/audioTiming';
import type {AudioAsset} from '../../lib/animation/audioCore';
/** Bounded waveform of the trimmed range: at most 400 columns drawn as one path, whatever the clip length or zoom. */
export function AudioWaveform({asset,trimIn,length,columns=160,label}:{asset:AudioAsset;trimIn:number;length:number;columns?:number;label:string}){
 const cols=visiblePeaks(asset.peaks,asset.durationTicks,trimIn,length,columns);
 const d=cols.map((p,i)=>`M${i+0.5} ${(10-Math.max(0.08,p)*9).toFixed(2)}V${(10+Math.max(0.08,p)*9).toFixed(2)}`).join('');
 return <svg role="img" aria-label={label} viewBox={`0 0 ${Math.max(1,cols.length)} 20`} preserveAspectRatio="none" className="size-full text-ink-2" data-testid="animation-waveform"><path d={d} stroke="currentColor" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke"/></svg>;
}
