import {test} from 'node:test';import assert from 'node:assert/strict';
import {scanSvg,elementAt,setAttrs,removePatch,applyPatches,insertChild,attr} from './source';
import {changesForDelta,translate,scaleAbout,rotateAbout,resizeDelta,mul,I} from './geometry';
import {pathToContours,contoursToPath,insertNode,deleteNode,setKind} from './pathnodes';
const SRC=`<?xml version="1.0"?>
<!-- keep me -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient>
    <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <style>.a{fill:url(#g)}</style>
  <rect id="r" x="10" y="10" width="20" height="20" class="a" filter="url(#f)"/>
  <g id="grp">
    <circle cx="50" cy="50" r="5"/>
  </g>
</svg>
`;
const scan=(t:string)=>{const r=scanSvg(t);assert.ok(r.ok);return r.ok?r.root:null!;};
test('scanner finds elements with paths',()=>{const root=scan(SRC);assert.equal(root.children.length,4);assert.equal(elementAt(root,[3,0])!.tag,'circle');assert.equal(attr(elementAt(root,[2])!,'id'),'r');});
test('moving a rect changes only its own tag',()=>{
 const root=scan(SRC);const el=elementAt(root,[2])!;const get=(n:string)=>attr(el,n);
 const ch=changesForDelta({tag:'rect',get},translate(5,0),I);
 const out=setAttrs(SRC,el,ch);const a=SRC.split('\n'),b=out.split('\n');
 const diff=a.map((l,i)=>l===b[i]?null:i).filter(x=>x!==null);assert.deepEqual(diff,[8]);assert.match(b[8],/x="15"/);assert.ok(b[8].includes('filter="url(#f)"'));assert.equal(a.length,b.length);});
test('resizing a rect writes geometry, rotating writes a transform',()=>{
 const get=(n:string)=>({x:'10',y:'10',width:'20',height:'20'} as Record<string,string>)[n];
 const s=changesForDelta({tag:'rect',get},scaleAbout(2,2,10,10),I);assert.deepEqual(s,{x:'10',y:'10',width:'40',height:'40'});
 const r=changesForDelta({tag:'rect',get},rotateAbout(90,20,20),I);assert.match(r.transform!,/^matrix\(/);});
test('a group moves through its transform attribute',()=>{const root=scan(SRC);const g=elementAt(root,[3])!;const ch=changesForDelta({tag:'g',get:n=>attr(g,n)},translate(3,4),I);assert.deepEqual(ch,{transform:'translate(3 4)'});
 const out=setAttrs(SRC,g,ch);assert.ok(out.includes('<g id="grp" transform="translate(3 4)">'));});
test('existing transform is composed',()=>{const ch=changesForDelta({tag:'g',get:n=>n==='transform'?'translate(10 0)':undefined},translate(5,5),I);assert.deepEqual(ch,{transform:'translate(15 5)'});});
test('removing an element removes its whole line',()=>{const root=scan(SRC);const out=applyPatches(SRC,[removePatch(SRC,elementAt(root,[2])!)]);assert.ok(!out.includes('id="r"'));assert.equal(out.split('\n').length,SRC.split('\n').length-1);});
test('inserting into a group and into a self-closing root keeps valid XML',()=>{
 const root=scan(SRC);const out=insertChild(SRC,elementAt(root,[3])!,null,'<rect width="1" height="1"/>');const r2=scanSvg(out);assert.ok(r2.ok);assert.equal(elementAt((r2 as any).root,[3])!.children.length,2);
 const e='<svg xmlns="http://www.w3.org/2000/svg"/>';const out2=insertChild(e,scan(e),null,'<path d="M0 0"/>');assert.ok(scanSvg(out2).ok);assert.ok(out2.includes('<path d="M0 0"/>'));});
test('attribute values with quotes and ampersands are escaped',()=>{const t='<svg a="1"><text>x</text></svg>';const el=scan(t);const out=setAttrs(t,el,{'data-x':'a "b" & c',a:null});assert.equal(out,'<svg data-x="a &quot;b&quot; &amp; c"><text>x</text></svg>');});
test('scanner rejects broken markup',()=>{assert.equal(scanSvg('<svg><g></svg>').ok,false);assert.equal(scanSvg('<div/>').ok,false);assert.equal(scanSvg('<svg a=1/>').ok,false);});
test('CDATA and comments with angle brackets are skipped',()=>{const t='<svg><style><![CDATA[a>b{}]]></style><!-- <g> --><rect/></svg>';assert.equal(scan(t).children.length,2);});
test('resize handle maths: east handle doubles width, shift keeps ratio',()=>{const m=resizeDelta({x:0,y:0,w:10,h:10},'e',{x:20,y:5},false,false);assert.deepEqual([m[0],m[3]],[2,1]);
 const m2=resizeDelta({x:0,y:0,w:10,h:10},'se',{x:20,y:12},true,false);assert.equal(m2[0],m2[3]);});
test('path nodes round trip and edits',()=>{
 const cs=pathToContours('M0 0 L10 0 L10 10 Z')!;assert.equal(cs[0].nodes.length,3);assert.equal(cs[0].closed,true);assert.equal(contoursToPath(cs),'M0 0L10 0L10 10Z');
 insertNode(cs[0],0,0.5);assert.equal(contoursToPath(cs),'M0 0L5 0L10 0L10 10Z');assert.equal(deleteNode(cs[0],1),true);
 const q=pathToContours('M0 0 Q 5 10 10 0')!;assert.ok(q[0].nodes[0].out);
 setKind(q[0],1,'smooth');assert.ok(q[0].nodes[1].in);
 const c2=pathToContours('M0 0C0 10 10 10 10 0')!;insertNode(c2[0],0,0.5);assert.equal(c2[0].nodes.length,3);assert.ok(Math.abs(c2[0].nodes[1].x-5)<1e-9);});
test('mul order: translate after scale',()=>{const m=mul(translate(10,0),scaleAbout(2,2,0,0));assert.deepEqual(m,[2,0,0,2,10,0]);});
