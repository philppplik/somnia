import {emptyRack} from './rack';
import {validateArrangement,type Arrangement} from './arrangement';
/** The single-track session behind per-track analysis: only the requested track with its own inserts, level and pan (mute/solo cleared), no master chain, no other tracks. Sources, markers, loop, tail and timing stay intact so validation, duration and the tail match the full render. */
export function trackAnalysisSession(raw:Arrangement,trackId:string):Arrangement{
 const s=validateArrangement(raw);const track=s.tracks.find(t=>t.id===trackId);if(!track)throw Error('Track no longer exists');
 if(!track.clips.length)throw Error('Track has no clips to analyse');
 return{...s,masterRack:emptyRack(),tracks:[{...track,mute:false,solo:false}]};
}
/** The single-track session behind freeze: like the analysis session, but level and pan neutralized - freeze bakes the rack only, the fader and pan stay live on the frozen track. */
export function freezeSession(raw:Arrangement,trackId:string):Arrangement{
 const one=trackAnalysisSession(raw,trackId);
 return{...one,tracks:one.tracks.map(t=>({...t,gainDb:0,pan:0}))};
}
