import type {MaskPath} from './model';
/** Regular polygons and stars as path points inside a square box. Pure leaf. */
export const MAX_POLY_SIDES=24,MIN_POLY_SIDES=3,MIN_INNER=10,MAX_INNER=95;
const r4=(n:number)=>Math.round(n*1e4)/1e4;
/** Closed path with `sides` corners (twice as many for a star) in a box of `2*radius`, first corner on top. `inner` is the star's inner radius in percent of the outer one. */
export function polygonPath(sides:number,star:boolean,inner:number):MaskPath{
 const n=star?sides*2:sides,pts=[];
 for(let i=0;i<n;i++){const r=star&&i%2?inner/100:1,a=-Math.PI/2+2*Math.PI*i/n;
  pts.push({x:r4(0.5+0.5*r*Math.cos(a)),y:r4(0.5+0.5*r*Math.sin(a))});}
 return {closed:true,points:pts};
}
