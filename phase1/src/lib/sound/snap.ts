import {arrangementEnd,type Arrangement} from './arrangement';
/** Magnetic snap targets in frames: 0, the session end, every other clip's edges and all markers. The dragged clip's own edges move with it, so they are excluded. */
export function snapPoints(s:Arrangement,excludeClipId?:string):number[]{
 const points=[0,arrangementEnd(s),...s.markers.map(m=>m.frame)];
 for(const track of s.tracks)for(const clip of track.clips){if(clip.id===excludeClipId)continue;points.push(clip.start,clip.start+clip.length);}
 return points;
}
/** Snaps a dragged frame position: the nearest magnetic point within threshold wins; otherwise the grid (snap enabled) or the raw frame. Deterministic ties go to the smaller frame. */
export function snapFrame(raw:number,points:number[],grid:number,threshold:number):number{
 if(!Number.isFinite(raw)||grid<1||threshold<0)throw Error('Invalid snap input');
 const base=Math.max(0,Math.round(raw/grid)*grid);
 let best=grid>1?base:Math.max(0,Math.round(raw)),bestDist=Math.abs(best-raw);
 for(const p of points){const d=Math.abs(p-raw);if(d<=threshold&&d<bestDist){best=p;bestDist=d;}}
 return best;
}
