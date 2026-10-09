import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from './timeline';
import type {ClipRange,TimelineClip} from './timeline';

/** Lead-confirmed P3 model. New tests only; no fallback math that could fake a green gate.
 * The compatibility extension lets this file typecheck on P2 and fail assertions meaningfully.
 * ASSUMPTION: setCrossfade has the same (clips,id,value)->clips calling style as setClipEdge.
 * ASSUMPTION: blendAt uses half-open ranges [start,end) at exact boundaries.
 */
type P3Clip=TimelineClip&{kind?:'media'|'title';crossfade_s?:number;title?:{text:string;size:number;color:string;background:string}};
type Blend={range:ClipRange;sourceTime:number;video:number;audio:number};
const media=(id:string,duration:number,fade=0,in_s=0):P3Clip=>({id,source:`${id}.webm`,in_s,out_s:in_s+duration,gain:1,muted:false,crossfade_s:fade});
const title=(id:string,duration:number,fade=0):P3Clip=>({id,kind:'title',source:'',in_s:0,out_s:duration,gain:1,muted:false,crossfade_s:fade,title:{text:'P3 title',size:32,color:'#ffffff',background:'#102030'}});
const near=(actual:number,expected:number,epsilon=1e-9)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
function setFade(clips:P3Clip[],id:string,seconds:number):P3Clip[]{
 const fn=(model as unknown as {setCrossfade?:(clips:P3Clip[],id:string,seconds:number)=>P3Clip[]}).setCrossfade;
 assert.equal(typeof fn,'function','P3 must export setCrossfade');return fn!(clips,id,seconds);
}
function blends(clips:P3Clip[],time:number):Blend[]{
 const fn=(model as unknown as {blendAt?:(clips:P3Clip[],time:number)=>Blend[]}).blendAt;
 assert.equal(typeof fn,'function','P3 must export blendAt');return fn!(clips,time);
}
const ranges=(clips:P3Clip[])=>model.clipRanges(clips).map(r=>[r.start,r.end]);

test('P3 duration: overlap subtracts exactly once, without changing source ranges',()=>{
 const clips=[media('a',2,0.5,3),media('b',3,0.75,7),media('c',4)];
 const original=structuredClone(clips);
 near(model.timelineDuration(clips),7.75);
 assert.deepEqual(ranges(clips),[[0,2],[1.5,4.5],[3.75,7.75]]);
 assert.deepEqual(clips,original,'timeline reads are non-destructive');
});

test('P3 duration: zero/absent fades preserve P2 hard-cut clocks',()=>{
 const a=media('a',2);delete a.crossfade_s;const clips=[a,media('b',3)];
 assert.deepEqual(ranges(clips),[[0,2],[2,5]]);near(model.timelineDuration(clips),5);
 assert.deepEqual(model.clipRanges([]),[]);assert.equal(model.timelineDuration([]),0);
});

test('P3 setCrossfade: clamps to the shorter neighbor and cannot fade after the last clip',()=>{
 const clips=[media('a',2),media('b',0.75)];
 near(setFade(clips,'a',99)[0].crossfade_s??0,0.75);
 near(setFade(clips,'a',-1)[0].crossfade_s??0,0);
 near(setFade(clips,'b',0.5)[1].crossfade_s??0,0);
 near(setFade(clips,'a',0.25)[0].crossfade_s??0,0.25);
 assert.deepEqual(clips,[media('a',2),media('b',0.75)],'setter does not mutate its argument');
});

test('P3 sanitize: trimmed source durations also clamp fades and clear the trailing fade',()=>{
 const clips=[media('a',8,4),media('b',2,3)];
 const clean=model.sanitizeClips(clips,{'a.webm':1,'b.webm':0.5}) as P3Clip[];
 assert.deepEqual(clean.map(c=>[c.in_s,c.out_s,c.crossfade_s??0]),[[0,1,0.5],[0,0.5,0]]);
 near(model.timelineDuration(clean),1);
});

test('P3 sanitize: dropping a degenerate neighbor re-clamps the surviving adjacency',()=>{
 const clips=[media('a',2,0.9),media('drop',0.01,0.9),media('c',0.3,1)];
 const clean=model.sanitizeClips(clips,{'a.webm':2,'drop.webm':1,'c.webm':0.3}) as P3Clip[];
 assert.deepEqual(clean.map(c=>c.id),['a','c']);
 near(clean[0].crossfade_s??0,0.3);near(clean[1].crossfade_s??0,0);
 near(model.timelineDuration(clean),2);
});

test('P3 sanitize: negative and non-finite fades cannot poison the timeline clock',()=>{
 // ASSUMPTION: invalid requested fades become hard cuts, not Infinity/NaN in clocks.
 for(const value of [-2,NaN,Infinity,-Infinity]){
  const clean=model.sanitizeClips([media('a',2,value),media('b',2)],{'a.webm':2,'b.webm':2}) as P3Clip[];
  near(clean[0].crossfade_s??0,0);near(model.timelineDuration(clean),4);
 }
});

test('P3 title ranges: generated cards need no source-duration entry and participate in overlaps',()=>{
 const clips=[title('intro',1,0.25),media('movie',2,0.5,5),title('outro',1.5)];
 assert.deepEqual(ranges(clips),[[0,1],[0.75,2.75],[2.25,3.75]]);
 near(model.timelineDuration(clips),3.75);
 const clean=model.sanitizeClips(clips,{'movie.webm':9,'':0}) as P3Clip[];
 assert.deepEqual(clean.map(c=>c.id),['intro','movie','outro'],'title is not looked up as a missing/zero-duration media source');
 near(model.timelineDuration(clean),3.75);
});

test('P3 sanitize titles: reset title in point and enforce the 3600-second cap',()=>{
 const dirty={...title('card',7200),in_s:12};
 const clean=model.sanitizeClips([dirty],{}) as P3Clip[];
 assert.equal(clean.length,1);assert.equal(clean[0].kind,'title');assert.equal(clean[0].source,'');
 assert.equal(clean[0].in_s,0);assert.equal(clean[0].out_s,3600);
 assert.deepEqual(clean[0].title,dirty.title,'valid text/font/colors survive sanitation');
});

test('P3 blendAt: midpoint carries BOTH decoded source times and independent linear/equal-power weights',()=>{
 const clips=[media('a',2,0.5,3),{...media('b',2,0,7),gain:0.25,muted:true}];
 const hit=blends(clips,1.75);assert.equal(hit.length,2);
 assert.deepEqual(hit.map(h=>h.range.clip.id),['a','b']);
 near(hit[0].sourceTime,4.75);near(hit[1].sourceTime,7.25);
 for(const h of hit){near(h.video,0.5);near(h.audio,Math.SQRT1_2);}
 near(hit.reduce((sum,h)=>sum+h.video,0),1);
 near(hit.reduce((sum,h)=>sum+h.audio*h.audio,0),1);
 // gain/mute belongs to rendering/mixing, not to the blend math API.
 assert.equal(hit[1].range.clip.gain,0.25);assert.equal(hit[1].range.clip.muted,true);
});

test('P3 blendAt: fade ramp conserves power and resolves source clocks across the whole overlap',()=>{
 const clips=[media('a',3,1,4),media('b',2,0,8)];
 for(const p of [0.01,0.1,0.25,0.5,0.75,0.9,0.99]){
  const hit=blends(clips,2+p);assert.equal(hit.length,2);
  near(hit[0].video,1-p);near(hit[1].video,p);
  near(hit[0].audio,Math.cos(p*Math.PI/2));near(hit[1].audio,Math.sin(p*Math.PI/2));
  near(hit[0].sourceTime,6+p);near(hit[1].sourceTime,8+p);
  near(hit[0].audio**2+hit[1].audio**2,1);
 }
 const before=blends(clips,1.5);assert.equal(before.length,1);near(before[0].video,1);near(before[0].audio,1);
 const after=blends(clips,3);assert.equal(after.length,1);assert.equal(after[0].range.clip.id,'b');near(after[0].sourceTime,9);
});

test('P3 split: new internal join is a cut, original outgoing fade stays on the right half',()=>{
 const clips=[media('a',3,0.5),media('b',2)];
 const split=model.splitAt(clips,1) as P3Clip[]|null;assert.ok(split);assert.equal(split.length,3);
 near(split[0].crossfade_s??0,0);near(split[1].crossfade_s??0,0.5);
 near(model.timelineDuration(split),model.timelineDuration(clips));
 assert.deepEqual(ranges(split),[[0,1],[1,3],[2.5,4.5]]);
});

test('P3 neutral recipe: a title card or real fade cannot be mistaken for an original-copy export',()=>{
 assert.equal(model.isNeutralTimeline([title('card',2)],'',2),false);
 assert.equal(model.isNeutralTimeline([media('a',2,0.5),media('b',2)],'a.webm',2),false);
 assert.equal(model.isNeutralTimeline([media('a',2)],'a.webm',2),true);
});
