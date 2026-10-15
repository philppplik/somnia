/** Boolean operations on polygons (flattened paths). Pure, no DOM, no dependencies.
 *
 *  Method: split every edge at all mutual intersections, then keep each sub-edge whose two sides differ in the result
 *  (decided by testing a point just left and right of its midpoint against each operand's fill rule), and chain the kept
 *  edges into closed loops. Overlapping collinear edges collapse to one. The result is polygonal: curves must be flattened first. */
export interface Pt{x:number;y:number}
export interface Operand{contours:Pt[][];rule:'nonzero'|'evenodd'}
export type BoolOp='union'|'subtract'|'intersect'|'exclude';
export const BOOL_OPS=['union','subtract','intersect','exclude'] as const;
export const MAX_BOOL_EDGES=3000;
const GRID=1e-6;
const snap=(v:number)=>Math.round(v/GRID)*GRID;
const key=(p:Pt)=>`${Math.round(p.x/GRID)},${Math.round(p.y/GRID)}`;
interface Seg{a:Pt;b:Pt}

function clean(c:readonly Pt[]):Pt[]{
  const out:Pt[]=[];for(const p of c){const q={x:snap(p.x),y:snap(p.y)};const l=out[out.length-1];if(!l||l.x!==q.x||l.y!==q.y)out.push(q);}
  while(out.length>1&&out[0].x===out[out.length-1].x&&out[0].y===out[out.length-1].y)out.pop();
  return out;
}
function inside(op:Operand,x:number,y:number):boolean{
  let wind=0,cross=0;
  for(const c of op.contours)for(let i=0;i<c.length;i++){
    const a=c[i],b=c[(i+1)%c.length];
    if((a.y<=y)!==(b.y<=y)){const t=(y-a.y)/(b.y-a.y),px=a.x+t*(b.x-a.x);if(px>x){cross++;wind+=b.y>a.y?1:-1;}}
  }
  return op.rule==='evenodd'?(cross&1)===1:wind!==0;
}
function result(op:BoolOp,flags:boolean[]):boolean{
  switch(op){
    case 'union':return flags.some(Boolean);
    case 'intersect':return flags.every(Boolean);
    case 'exclude':return flags.filter(Boolean).length%2===1;
    case 'subtract':return flags[0]&&!flags.slice(1).some(Boolean);
  }
}
/** Returns closed contours (no repeated end point) whose union with the even-odd rule is the result. May be empty. */
export function booleanContours(operands:readonly Operand[],op:BoolOp):Pt[][]{
  if(!(BOOL_OPS as readonly string[]).includes(op))throw Error('Unknown boolean operation');
  if(operands.length<2)throw Error('A boolean operation needs at least two shapes');
  const ops:Operand[]=operands.map(o=>({rule:o.rule,contours:o.contours.map(clean).filter(c=>c.length>=3)}));
  const segs:Seg[]=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const o of ops){if(!o.contours.length)throw Error('A shape has no usable outline');
    for(const c of o.contours)for(let i=0;i<c.length;i++){const a=c[i],b=c[(i+1)%c.length];
      if(![a.x,a.y,b.x,b.y].every(Number.isFinite))throw Error('Shape has invalid coordinates');
      segs.push({a,b});minX=Math.min(minX,a.x);maxX=Math.max(maxX,a.x);minY=Math.min(minY,a.y);maxY=Math.max(maxY,a.y);}}
  if(segs.length>MAX_BOOL_EDGES)throw Error(`The shapes are too detailed for a boolean operation (limit ${MAX_BOOL_EDGES} segments)`);
  const diag=Math.hypot(maxX-minX,maxY-minY)||1;
  const ts:number[][]=segs.map(()=>[0,1]);
  const E=1e-9;
  for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){
    const s=segs[i],t=segs[j];
    if(Math.max(s.a.x,s.b.x)<Math.min(t.a.x,t.b.x)-GRID||Math.max(t.a.x,t.b.x)<Math.min(s.a.x,s.b.x)-GRID||Math.max(s.a.y,s.b.y)<Math.min(t.a.y,t.b.y)-GRID||Math.max(t.a.y,t.b.y)<Math.min(s.a.y,s.b.y)-GRID)continue;
    const rx=s.b.x-s.a.x,ry=s.b.y-s.a.y,qx=t.b.x-t.a.x,qy=t.b.y-t.a.y,den=rx*qy-ry*qx,wx=t.a.x-s.a.x,wy=t.a.y-s.a.y;
    const ls=Math.hypot(rx,ry),lt=Math.hypot(qx,qy);
    if(Math.abs(den)>E*ls*lt){
      const u=(wx*qy-wy*qx)/den,v=(wx*ry-wy*rx)/den;
      if(u>=-E&&u<=1+E&&v>=-E&&v<=1+E){ts[i].push(Math.min(1,Math.max(0,u)));ts[j].push(Math.min(1,Math.max(0,v)));}
    }else if(Math.abs(wx*ry-wy*rx)<=1e-7*Math.max(1,ls)){ // collinear: endpoints of each inside the other
      const proj=(p:Pt,o:Seg,len:number)=>((p.x-o.a.x)*(o.b.x-o.a.x)+(p.y-o.a.y)*(o.b.y-o.a.y))/(len*len);
      for(const p of [t.a,t.b]){const u=proj(p,s,ls);if(u>0&&u<1)ts[i].push(u);}
      for(const p of [s.a,s.b]){const v=proj(p,t,lt);if(v>0&&v<1)ts[j].push(v);}
    }
  }
  const edges=new Map<string,{u:Pt;v:Pt}>();
  segs.forEach((s,i)=>{
    const list=[...new Set(ts[i].map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b);
    let prev:Pt={x:s.a.x,y:s.a.y};
    for(let k=1;k<list.length;k++){
      const t=list[k],p=k===list.length-1?{x:s.b.x,y:s.b.y}:{x:snap(s.a.x+(s.b.x-s.a.x)*t),y:snap(s.a.y+(s.b.y-s.a.y)*t)};
      const ka=key(prev),kb=key(p);
      if(ka!==kb){const id=ka<kb?ka+'|'+kb:kb+'|'+ka;if(!edges.has(id))edges.set(id,{u:prev,v:p});}
      prev=p;
    }
  });
  const kept:{u:Pt;v:Pt}[]=[];
  for(const {u,v} of edges.values()){
    const dx=v.x-u.x,dy=v.y-u.y,len=Math.hypot(dx,dy);if(len<GRID)continue;
    const eps=Math.min(len*0.01,diag*1e-4),nx=-dy/len*eps,ny=dx/len*eps,mx=(u.x+v.x)/2,my=(u.y+v.y)/2;
    const left=result(op,ops.map(o=>inside(o,mx+nx,my+ny))),right=result(op,ops.map(o=>inside(o,mx-nx,my-ny)));
    if(left&&!right)kept.push({u,v});else if(right&&!left)kept.push({u:v,v:u});
  }
  const out=new Map<string,{u:Pt;v:Pt;used:boolean}[]>();
  for(const e of kept){const k=key(e.u);(out.get(k)??out.set(k,[]).get(k)!).push({...e,used:false});}
  const loops:Pt[][]=[];
  for(const list of out.values())for(const start of list){
    if(start.used)continue;start.used=true;const loop=[start.u];let cur=start,guard=0;
    while(key(cur.v)!==key(start.u)&&guard++<kept.length+2){
      loop.push(cur.v);const next=(out.get(key(cur.v))??[]).find(e=>!e.used);if(!next){loop.length=0;break;}next.used=true;cur=next;}
    if(loop.length>=3)loops.push(loop);
  }
  return loops.map(simplify).filter(l=>l.length>=3&&Math.abs(area(l))>GRID*GRID*10);
}
const area=(l:readonly Pt[])=>l.reduce((s,p,i)=>{const q=l[(i+1)%l.length];return s+(p.x*q.y-q.x*p.y)/2;},0);
/** Drops points that lie on the straight line between their neighbours. */
function simplify(l:Pt[]):Pt[]{
  let pts=l;let changed=true;
  while(changed&&pts.length>3){changed=false;const next:Pt[]=[];
    for(let i=0;i<pts.length;i++){const a=pts[(i+pts.length-1)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];
      const cr=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cr)<=1e-9*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)*Math.hypot(c.x-b.x,c.y-b.y))&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>0){changed=true;continue;}
      next.push(b);}
    pts=next;}
  return pts;
}
