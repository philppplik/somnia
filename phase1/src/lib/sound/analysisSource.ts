import {emptyRack} from './rack';
import {validateArrangement,type Arrangement} from './arrangement';
/** The single-track session behind per-track analysis: only the requested track with its own inserts, level and pan (mute/solo cleared), no master chain, no other tracks. Sources, markers, loop, tail and timing stay intact so validation, duration and the tail match the full render. */
export function trackAnalysisSession(raw:Arrangement,trackId:string):Arrangement{
 const s=validateArrangement(raw);const track=s.tracks.find(t=>t.id===trackId);if(!track)throw Error('Track no longer exists');
 if(!track.clips.length)throw Error('Track has no clips to analyse');
 return{...s,masterRack:emptyRack(),tracks:[{...track,mute:false,solo:false}]};
}
/** The single-track session behind glue/consolidate: only the selected clips with their clip-level settings (gain, fades, curves bake in), racks emptied and level/pan/automation neutralized - the fader, pan, gain curve and rack stay live on the track. No tail: nothing rings. */
export function glueSession(raw:Arrangement,trackId:string,ids:string[]):Arrangement{
 const s=validateArrangement(raw);const track=s.tracks.find(t=>t.id===trackId);if(!track)throw Error('Track no longer exists');
 if(!Array.isArray(ids)||ids.length<2)throw Error('Select at least two clips on one track');
 const clips=track.clips.filter(c=>ids.includes(c.id));
 if(clips.length!==ids.length)throw Error('All glued clips must be on the same track');
 return{...s,masterRack:emptyRack(),tailFrames:0,tracks:[{...track,gainDb:0,pan:0,gainCurve:[],mute:false,solo:false,rack:emptyRack(),clips}]};
}
/** The single-track session behind freeze: like the analysis session, but level, pan and volume automation neutralized - freeze bakes the rack only, the fader, pan and gain curve stay live on the frozen track. */
export function freezeSession(raw:Arrangement,trackId:string):Arrangement{
 const one=trackAnalysisSession(raw,trackId);
 return{...one,tracks:one.tracks.map(t=>({...t,gainDb:0,pan:0,gainCurve:[]}))};
}
