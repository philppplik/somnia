import type {LayerSource} from './model';
/** Original bounded radial primitives, normalised to source dimensions. */
export function radialPath(source:LayerSource):string{
 const count=source.sides??5,star=source.shape==='star',points=star?count*2:count,w=source.width??400,h=source.height??240,ratio=source.innerRatio??0.45;
 return Array.from({length:points},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/points,r=star&&i%2?ratio:1;return `${i?'L':'M'} ${w/2+Math.cos(a)*w/2*r} ${h/2+Math.sin(a)*h/2*r}`;}).join(' ')+' Z';
}
export function gradientVector(angle:number){const a=angle*Math.PI/180,x=Math.cos(a)/2,y=Math.sin(a)/2;return {x1:0.5-x,y1:0.5-y,x2:0.5+x,y2:0.5+y};}

/** SVG definition of a layer gradient (linear along the angle, or radial from the box centre). */
export function gradientDefSvg(id:string,g:{start:string;end:string;angle:number;kind?:'linear'|'radial'}):string{
 const stops=`<stop offset="0" stop-color="${g.start}"/><stop offset="1" stop-color="${g.end}"/>`;
 if(g.kind==='radial')return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`;
 const v=gradientVector(g.angle);return `<linearGradient id="${id}" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">${stops}</linearGradient>`;
}
