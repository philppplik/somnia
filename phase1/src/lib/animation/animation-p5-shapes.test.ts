import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,validateDocument} from './model';import {applyEdit} from './edit';import {radialPath,gradientVector} from './shapes';import {frameSvg} from './exportFrames';import {serializeAnimationSnapshot,parseAnimationSnapshot} from './persistence';import {defaultView} from './recovery';
const base=()=>applyEdit(createDocument(),{type:'layer.add',kind:'shape',id:'shape'});
test('star/polygon primitives are bounded deterministic closed paths',()=>{
 const star=radialPath({shape:'star',sides:5,width:100,height:100,innerRatio:0.4});assert.equal((star.match(/L /g)??[]).length,9);assert.ok(star.endsWith(' Z'));assert.ok(!star.includes('NaN'));const polygon=radialPath({shape:'polygon',sides:6,width:100,height:80});assert.equal((polygon.match(/L /g)??[]).length,5);assert.deepEqual(gradientVector(0),{x1:0,y1:0.5,x2:1,y2:0.5});
});
test('rounded rect, radial shapes, stroke and gradient round-trip and export real SVG definitions',()=>{
 for(const shape of ['roundedRect','star','polygon'] as const){let d=applyEdit(base(),{type:'layer.update',layer:'shape',source:{shape,radius:12,sides:7,innerRatio:0.3,gradient:{start:'#ff0000',end:'#0000ff',angle:45}}});d=applyEdit(d,{type:'layer.stroke',layer:'shape',stroke:{color:'#ffffff',width:4}});assert.deepEqual(validateDocument(d),[]);assert.deepEqual(parseAnimationSnapshot(serializeAnimationSnapshot(d,defaultView())).doc,d);const svg=frameSvg(findComp(d)!,0);assert.ok(svg.includes('<linearGradient'));assert.ok(svg.includes('fill="url(#gradient-0)"'));assert.ok(svg.includes('stroke-width="4"'));if(shape==='roundedRect')assert.ok(svg.includes('rx="12"'));else assert.ok(svg.includes('<path d="M '));}
});
test('primitive parameters and gradient reject hostile, huge or non-finite values',()=>{
 for(const source of [{sides:1000},{innerRatio:0},{radius:-1},{gradient:{start:'url(https://evil)',end:'#000000',angle:0}},{gradient:{start:'#ffffff',end:'#000000',angle:Infinity}}])assert.throws(()=>applyEdit(base(),{type:'layer.update',layer:'shape',source}));
});
