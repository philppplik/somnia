import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as S from './session';
import {rectPath} from './shapes';
import {selectionSvg,pasteSvgText,looksLikeSvg,PASTE_OFFSET} from './clipboard';
import {toggleLock} from './lock';
import {groupSelection} from './groups';
const mk=()=>{S.resetVectorSession();S.createBlankVector();const a=rectPath({x:0,y:0,w:10,h:10}),b=rectPath({x:20,y:0,w:10,h:10});S.addPath(a,true);S.addPath(b,false);return [a.id,b.id] as const;};

test('copy: only the selection, nothing when empty, locked paths are never copied',()=>{
 const [a,b]=mk();const s=()=>S.getVectorSession();
 assert.equal(selectionSvg(s().doc,[]),null);
 const svg=selectionSvg(s().doc,[a])!;assert.equal((svg.match(/<path /g)??[]).length,1);assert.ok(svg.includes('M0 0'));assert.ok(!svg.includes('M20 0'));
 S.commit(toggleLock(s().doc,b));assert.equal(selectionSvg(s().doc,[b]),null);
});
test('paste: groups, group names and gradients travel with the copy',()=>{
 const [a,b]=mk();const s=()=>S.getVectorSession();S.commit(groupSelection(s().doc,[a,b]));
 const g=s().doc.paths[0].group!;S.renameGroup(g,'Logo');
 const svg=selectionSvg(s().doc,[a])!;assert.ok(svg.includes('data-vs-group-name="Logo"'));
 assert.equal(pasteSvgText(svg),true);
 const added=s().doc.paths.slice(2);assert.equal(added.length,2);assert.ok(added.every(p=>p.group&&p.group!==g&&p.group===added[0].group));
 assert.equal(s().doc.groupNames?.[added[0].group!],'Logo');assert.equal(s().doc.groupNames?.[g],'Logo');
});
test('paste roundtrip: copy then paste doubles the objects at +offset, undo removes them',()=>{
 const [a]=mk();const s=()=>S.getVectorSession();const svg=selectionSvg(s().doc,[a])!;
 const n=s().doc.paths.length;assert.equal(pasteSvgText(svg),true);
 assert.equal(s().doc.paths.length,n+1);const p=s().doc.paths.at(-1)!;
 assert.equal(p.nodes[0].x,PASTE_OFFSET);assert.equal(p.nodes[0].y,PASTE_OFFSET);assert.notEqual(p.id,a);
 assert.deepEqual(s().selection,[p.id]);
 S.undo();assert.equal(s().doc.paths.length,n);
});
test('paste: text that is not an SVG is ignored; malformed or hostile SVG leaves the document unchanged',()=>{
 mk();const before=structuredClone(S.getVectorSession().doc);
 for(const t of ['','hello world','<html></html>','{"svg":1}'])assert.equal(pasteSvgText(t),false);
 assert.equal(looksLikeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>'),true);
 assert.equal(looksLikeSvg('x'.repeat(5_000_001)),false);
 for(const t of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L"/></svg>','<svg><g'])assert.equal(pasteSvgText(t),false);
 assert.deepEqual(S.getVectorSession().doc.paths.map(p=>p.id),before.paths.map(p=>p.id));
});
