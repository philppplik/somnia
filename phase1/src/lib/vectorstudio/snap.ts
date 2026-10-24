import type {Box} from './geometry';
export interface SnapResult{dx:number;dy:number;guides:{x:number[];y:number[]}}
const marks=(lo:number,hi:number)=>[lo,(lo+hi)/2,hi];
/** Snaps a move of `moving` by (dx,dy) so its left/centre/right and top/middle/bottom line up with the same marks of `targets`.
 *  `threshold` is in document units (pass screen pixels divided by zoom). Each axis snaps independently to the nearest mark within the threshold. Guides list the aligned lines. */
export function snapMove(moving:Box,dx:number,dy:number,targets:readonly Box[],threshold:number):SnapResult{
  if(![moving.minX,moving.minY,moving.maxX,moving.maxY,dx,dy,threshold].every(Number.isFinite)||threshold<0)throw Error('Snap input is not finite');
  const axis=(lo:number,hi:number,d:number,get:(b:Box)=>[number,number])=>{
    let best:{adj:number;at:number}|null=null;
    for(const t of targets){const [tl,th]=get(t);if(![tl,th].every(Number.isFinite))continue;
      for(const m of marks(lo+d,hi+d))for(const g of marks(tl,th)){const adj=g-m;if(Math.abs(adj)<=threshold&&(!best||Math.abs(adj)<Math.abs(best.adj)-1e-9))best={adj,at:g};}}
    if(!best)return {d,lines:[] as number[]};
    const nd=d+best.adj,lines=new Set<number>();
    for(const t of targets){const [tl,th]=get(t);for(const m of marks(lo+nd,hi+nd))for(const g of marks(tl,th))if(Math.abs(g-m)<1e-6)lines.add(g);}
    return {d:nd,lines:[...lines]};
  };
  const x=axis(moving.minX,moving.maxX,dx,b=>[b.minX,b.maxX]),y=axis(moving.minY,moving.maxY,dy,b=>[b.minY,b.maxY]);
  return {dx:x.d,dy:y.d,guides:{x:x.lines,y:y.lines}};
}
