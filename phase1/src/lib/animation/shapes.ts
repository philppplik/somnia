import type {LayerSource} from './model';
/** Original bounded radial primitives, normalised to source dimensions. */
export function radialPath(source:LayerSource):string{
 const count=source.sides??5,star=source.shape==='star',points=star?count*2:count,w=source.width??400,h=source.height??240,ratio=source.innerRatio??0.45;
 return Array.from({length:points},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/points,r=star&&i%2?ratio:1;return `${i?'L':'M'} ${w/2+Math.cos(a)*w/2*r} ${h/2+Math.sin(a)*h/2*r}`;}).join(' ')+' Z';
}
export function gradientVector(angle:number){const a=angle*Math.PI/180,x=Math.cos(a)/2,y=Math.sin(a)/2;return {x1:0.5-x,y1:0.5-y,x2:0.5+x,y2:0.5+y};}

/** SVG definition of a layer gradient (linear along the angle, or radial from the box centre). */
export function gradientDefSvg(id:string,g:{start:string;end:string;angle:number;kind?:'linear'|'radial';startOpacity?:number;endOpacity?:number;/** Radial only: centre (0..1 of the box, default 0.5) and radius (0.05..1.5, default 0.5). */cx?:number;cy?:number;radius?:number;stops?:readonly {offset:number;color:string;opacity?:number}[]}):string{
 const stop=(offset:number|string,color:string,o?:number)=>`<stop offset="${offset}" stop-color="${color}"${o!==undefined&&o<100?` stop-opacity="${Math.round(o)/100}"`:''}/>`;
 const stops=stop(0,g.start,g.startOpacity)+(g.stops??[]).map(x=>stop(x.offset,x.color,x.opacity)).join('')+stop(1,g.end,g.endOpacity);
 if(g.kind==='radial')return `<radialGradient id="${id}" cx="${g.cx??0.5}" cy="${g.cy??0.5}" r="${g.radius??0.5}">${stops}</radialGradient>`;
 const v=gradientVector(g.angle);return `<linearGradient id="${id}" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">${stops}</linearGradient>`;
}

type GradientLike={start:string;end:string;cx?:number;cy?:number;radius?:number;startOpacity?:number;endOpacity?:number;stops?:readonly {offset:number;color:string;opacity?:number}[]};
/** Adds a stop in the middle of the widest gap, coloured like the stop on its left. Returns the gradient unchanged at the limit. */
export function addGradientStop<G extends GradientLike>(g:G,max=6):G{
 const st=g.stops??[];if(st.length>=max)return g;
 const pts:{offset:number;color:string;opacity?:number}[]=[{offset:0,color:g.start,opacity:g.startOpacity},...st,{offset:1,color:g.end,opacity:g.endOpacity}];let bi=0,bw=-1;
 for(let i=0;i<pts.length-1;i++){const w=pts[i+1].offset-pts[i].offset;if(w>bw){bw=w;bi=i;}}
 const offset=Math.round((pts[bi].offset+bw/2)*100)/100;if(offset<0.01||offset>0.99||st.some(x=>x.offset===offset))return g;
 return {...g,stops:[...st,{offset,color:pts[bi].color,...(pts[bi].opacity!==undefined?{opacity:pts[bi].opacity}:{})}].sort((a,b)=>a.offset-b.offset)};
}
/** Sets colour and/or offset (0..1) of stop i; the offset is kept strictly between its neighbours. */
export function setGradientStop<G extends GradientLike>(g:G,i:number,patch:{offset?:number;color?:string;opacity?:number}):G{
 const st=[...(g.stops??[])];if(!st[i])return g;
 const lo=(i?st[i-1].offset:0)+0.01,hi=(i<st.length-1?st[i+1].offset:1)-0.01;
 const offset=patch.offset===undefined?st[i].offset:Math.round(Math.min(hi,Math.max(lo,patch.offset))*100)/100;
 const opacity=patch.opacity===undefined?st[i].opacity:Math.min(100,Math.max(0,Math.round(patch.opacity)));st[i]={offset,color:patch.color??st[i].color,...(opacity!==undefined&&opacity<100?{opacity}:{})};return {...g,stops:st};
}
export function removeGradientStop<G extends GradientLike>(g:G,i:number):G{
 const st=(g.stops??[]).filter((_,k)=>k!==i);const {stops:_o,...rest}=g;return (st.length?{...rest,stops:st}:rest) as G;
}

/** Sets the start or end opacity (percent); 100 removes the field so old output stays unchanged. */
export function setGradientEndOpacity<G extends GradientLike>(g:G,which:'start'|'end',v:number):G{
 const key=which==='start'?'startOpacity':'endOpacity';const {[key]:_o,...rest}=g as G&Record<string,unknown>;const o=Math.min(100,Math.max(0,Math.round(v)));
 return (o<100?{...rest,[key]:o}:rest) as unknown as G;
}

/** Sets the radial centre or radius from a percent value; the default (50) removes the field so old output stays unchanged. */
export function setGradientGeometry<G extends GradientLike>(g:G,key:'cx'|'cy'|'radius',percent:number):G{
 const lo=key==='radius'?5:0,hi=key==='radius'?150:100,v=Math.round(Math.min(hi,Math.max(lo,percent)))/100;
 const {[key]:_o,...rest}=g as G&Record<string,unknown>;return (v===0.5?rest:{...rest,[key]:v}) as unknown as G;
}
