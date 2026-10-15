import {test} from 'node:test';
import assert from 'node:assert/strict';
import {booleanContours,type Pt,type Operand} from './polyBoolean';
const rect=(x:number,y:number,w:number,h:number):Pt[]=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const op=(c:Pt[][],rule:'nonzero'|'evenodd'='nonzero'):Operand=>({contours:c,rule});
const area=(l:Pt[])=>Math.abs(l.reduce((s,p,i)=>{const q=l[(i+1)%l.length];return s+(p.x*q.y-q.x*p.y)/2;},0));
const signed=(l:Pt[])=>l.reduce((s,p,i)=>{const q=l[(i+1)%l.length];return s+(p.x*q.y-q.x*p.y)/2;},0);
/** Net area: loops carry orientation (outer one way, holes the other). */
const total=(ls:Pt[][])=>Math.abs(ls.reduce((s,l)=>s+signed(l),0));
const circle=(cx:number,cy:number,r:number,n=64):Pt[]=>Array.from({length:n},(_,i)=>({x:cx+r*Math.cos(2*Math.PI*i/n),y:cy+r*Math.sin(2*Math.PI*i/n)}));
const A=op([rect(0,0,100,100)]),B=op([rect(50,50,100,100)]);
test('overlapping squares: union, intersect, subtract, exclude areas and shapes',()=>{
  assert.ok(Math.abs(total(booleanContours([A,B],'union'))-17500)<1e-6);
  const i=booleanContours([A,B],'intersect');assert.equal(i.length,1);assert.equal(i[0].length,4);assert.ok(Math.abs(total(i)-2500)<1e-6);
  assert.ok(Math.abs(total(booleanContours([A,B],'subtract'))-7500)<1e-6);
  assert.ok(Math.abs(total(booleanContours([A,B],'exclude'))-15000)<1e-6);
  assert.equal(booleanContours([A,B],'union')[0].length,8);
});
test('disjoint, contained, touching and identical shapes',()=>{
  const far=op([rect(300,300,10,10)]);assert.equal(booleanContours([A,far],'intersect').length,0);assert.equal(booleanContours([A,far],'union').length,2);
  const inner=op([rect(20,20,10,10)]);assert.ok(Math.abs(total(booleanContours([A,inner],'union'))-10000)<1e-6);assert.ok(Math.abs(total(booleanContours([A,inner],'intersect'))-100)<1e-6);
  const hole=booleanContours([A,inner],'subtract');assert.equal(hole.length,2);assert.ok(Math.abs(total(hole)-9900)<1e-6);assert.ok(signed(hole[0])*signed(hole[1])<0);
  assert.ok(Math.abs(total(booleanContours([A,A],'union'))-10000)<1e-6);assert.equal(booleanContours([A,A],'subtract').length,0);assert.equal(booleanContours([A,A],'exclude').length,0);
  const edge=op([rect(100,0,50,100)]);const u=booleanContours([A,edge],'union');assert.equal(u.length,1);assert.ok(Math.abs(total(u)-15000)<1e-6);
  assert.equal(booleanContours([A,edge],'intersect').length,0);
  const shared=op([rect(0,0,100,50)]);assert.ok(Math.abs(total(booleanContours([A,shared],'subtract'))-5000)<1e-6);
});
test('circles, three operands, evenodd rings and curved subtract stay consistent',()=>{
  const c1=op([circle(0,0,50)]),c2=op([circle(40,0,50)]);const u=total(booleanContours([c1,c2],'union')),i=total(booleanContours([c1,c2],'intersect')),a1=area(circle(0,0,50));
  assert.ok(Math.abs(u+i-2*a1)<1,'inclusion-exclusion '+(u+i)+' vs '+2*a1);
  assert.ok(Math.abs(total(booleanContours([c1,c2],'subtract'))-(a1-i))<1);
  const three=booleanContours([A,B,op([rect(25,25,100,100)])],'intersect');assert.ok(Math.abs(total(three)-2500)<1e-6);
  const ring=op([rect(0,0,100,100),rect(25,25,50,50)],'evenodd');
  assert.ok(Math.abs(total(booleanContours([ring,op([rect(0,0,10,10)])],'union'))-7500)<1e-6);
  assert.ok(Math.abs(total(booleanContours([ring,op([rect(40,40,20,20)])],'union'))-(7500+400))<1e-6);
});
test('invalid input and size limits are refused',()=>{
  assert.throws(()=>booleanContours([A],'union'),/at least two/);assert.throws(()=>booleanContours([A,B],'xor' as never),/Unknown/);
  assert.throws(()=>booleanContours([A,op([[{x:0,y:0},{x:1,y:1}]])],'union'),/no usable/);
  assert.throws(()=>booleanContours([A,op([rect(0,NaN,5,5)])],'union'),/invalid/);
  assert.throws(()=>booleanContours([op([circle(0,0,10,2000)]),op([circle(5,0,10,2000)])],'union'),/too detailed/);
});
test('fuzz: integer rectangles with shared edges and corners match exact areas',()=>{
  let seed=12345;const rnd=(n:number)=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
  for(let k=0;k<400;k++){
    const r=()=>({x:rnd(6)*10,y:rnd(6)*10,w:(rnd(4)+1)*10,h:(rnd(4)+1)*10});const a=r(),b=r();
    const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)),inter=ix*iy,aa=a.w*a.h,ba=b.w*b.h;
    const P=[op([rect(a.x,a.y,a.w,a.h)]),op([rect(b.x,b.y,b.w,b.h)])];
    const exp={union:aa+ba-inter,intersect:inter,subtract:aa-inter,exclude:aa+ba-2*inter};
    for(const o of ['union','intersect','subtract','exclude'] as const){
      const got=total(booleanContours(P,o));assert.ok(Math.abs(got-exp[o])<1e-6,`${o} ${JSON.stringify([a,b])} got ${got} want ${exp[o]}`);}
  }
});
