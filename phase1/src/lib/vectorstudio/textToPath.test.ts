import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeDoc, type VectorText} from '../vectorio';
import opentype from 'opentype.js';
import {TextToPathError, loadLocalFont, textToOutlinePaths, textToPathCommit} from './textToPath';

const buf=readFileSync(new URL('../../../test/fixtures/render/assets/DejaVuSans.ttf',import.meta.url));
const font=opentype.parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength) as ArrayBuffer);
const T=(p:Partial<VectorText>={}):VectorText=>({id:'t1',x:10,y:40,text:'Hi',fontFamily:'DejaVu Sans',fontSize:20,fontWeight:'normal',fontStyle:'normal',anchor:'start',fill:'#112233',...p});
const doc=(...texts:VectorText[])=>normalizeDoc({width:200,height:100,paths:[],texts} as any);

test('outline: one path per closed contour, one compound per glyph, one group for all',()=>{
 const paths=textToOutlinePaths(font,T());
 assert.ok(paths.length>=3); // H:1 contour, i:2 (stem+dot)
 for(const p of paths){assert.ok(p.closed);assert.ok(p.nodes.length>2);assert.ok(p.style?.fill==='#112233'&&p.style.fillRule==='evenodd'&&p.style.stroke==='none');}
 const compounds=new Set(paths.map(p=>p.compound));assert.equal(compounds.size,2); // one per glyph
 const groups=new Set(paths.map(p=>p.group));assert.equal(groups.size,1);
 const ys=paths.flatMap(p=>p.nodes.map(n=>n.y));
 assert.ok(Math.min(...ys)<40&&Math.max(...ys)>=40); // outline spans the baseline y=40
});

test('outline: counters share the glyph compound (A has 2 contours)',()=>{
 const paths=textToOutlinePaths(font,T({text:'A'}));
 assert.equal(paths.length,2);
 assert.equal(paths[0].compound,paths[1].compound);
});

test('outline: multiline offsets the second line by fontSize*1.2',()=>{
 const paths=textToOutlinePaths(font,T({text:'A\nA',fontSize:10}));
 assert.equal(paths.length,4); // 2 contours per A
 for(let i=0;i<2;i++){
  const a=paths[i],b=paths[i+2];
  assert.equal(a.nodes.length,b.nodes.length);
  for(let j=0;j<a.nodes.length;j++){
   assert.equal(a.nodes[j].x,b.nodes[j].x);
   assert.ok(Math.abs(b.nodes[j].y-a.nodes[j].y-12)<0.01);
  }
 }
});

test('outline: anchor middle and end shift by the kerned advance',()=>{
 const s=textToOutlinePaths(font,T({text:'II'})),m=textToOutlinePaths(font,T({text:'II',anchor:'middle'})),e=textToOutlinePaths(font,T({text:'II',anchor:'end'}));
 const x0=(ps:typeof s)=>Math.min(...ps.flatMap(p=>p.nodes.map(n=>n.x)));
 const w=x0(s)-x0(e); // anchor end pushes the line left by its advance
 assert.ok(w>0&&Math.abs((x0(s)-x0(m))-w/2)<0.01);
});

test('outline: rotation rotates points about (x,y)',()=>{
 const flat=textToOutlinePaths(font,T({text:'I'})),rot=textToOutlinePaths(font,T({text:'I',rotation:90}));
 const a=flat[0].nodes[0],b=rot[0].nodes[0]; // 90deg: (x,y) -> (tx-(y-ty), ty+(x-tx))
 assert.ok(Math.abs(b.x-(10-(a.y-40)))<0.01&&Math.abs(b.y-(40+(a.x-10)))<0.01);
});

test('malformed input fails closed: empty, overlong, missing glyph, bad size/rotation',()=>{
 assert.throws(()=>textToOutlinePaths(font,T({text:'  '})),TextToPathError);
 assert.throws(()=>textToOutlinePaths(font,T({text:'a'.repeat(2001)})),/2000/);
 assert.throws(()=>textToOutlinePaths(font,T({text:'\u4E00'})),/missing/);
 assert.throws(()=>textToOutlinePaths(font,T({fontSize:0})),TextToPathError);
 assert.throws(()=>textToOutlinePaths(font,T({rotation:400})),TextToPathError);
 assert.throws(()=>textToOutlinePaths(font,T({text:'A'.repeat(900),fontSize:10})),/Too many nodes/);
});

test('commit: replaces the text in one doc step, keeps paint order and hidden',()=>{
 const d=doc(T());
 const {doc:d2,ids}=textToPathCommit(d,'t1',font);
 assert.equal(d2.texts,undefined);assert.ok(ids.length>=3&&d2.paths.length===ids.length);
 assert.ok(d2.paths.every(p=>p.style?.fill==='#112233'));
 const d3=doc(T({id:'back1',back:true,hidden:true}),T({id:'front1',text:'B'}));
 const r=textToPathCommit(d3,'back1',font);
 assert.deepEqual(r.doc.paths.slice(0,r.ids.length).map(p=>p.id),r.ids); // back text goes behind existing paths
 assert.equal(r.doc.texts?.length,1);assert.equal(r.doc.texts?.[0].id,'front1');
 assert.ok(r.doc.paths.every(p=>p.hidden));
});

test('commit: locked or unknown text throws, doc unchanged',()=>{
 const d=doc(T({locked:true}));
 assert.throws(()=>textToPathCommit(d,'t1',font),/locked/);
 assert.throws(()=>textToPathCommit(d,'nope',font),/Unknown/);
 assert.equal(d.texts?.length,1);
});

test('loadLocalFont: missing Local Font Access API fails closed',async()=>{
 await assert.rejects(()=>loadLocalFont(T()),/not accessible/);
 await assert.rejects(()=>loadLocalFont(T({fontFamily:''})),/Invalid/);
});

test('fail-closed: scripts needing OpenType shaping are refused, never silently altered',()=>{
 for(const [name,text] of [['arabic','مرحبا'],['hebrew','שלום'],['devanagari','नमस्ते'],['thai','สวัสดี'],['combining mark','é'],['zwj sequence','a‍b'],['hangul jamo','한'],['variation selector','✈️']] as const)
  assert.throws(()=>textToOutlinePaths(font,T({text})),(e:unknown)=>e instanceof TextToPathError&&e.code==='unsupportedScript',name);
 // latin, greek, cyrillic, digits, punctuation stay convertible
 for(const ok of ['Hello','Grüße!','Αθήνα','Москва','Café 42%']) assert.ok(textToOutlinePaths(font,T({text:ok})).length>0,ok);
 const spaced=textToOutlinePaths(font,T({text:'H a l l o'})); // spaces advance without contours
 assert.deepEqual(new Set(spaced.map(p=>p.group)).size===1&&spaced.length>=5,true);
});

test('errors carry a stable code and params for the localized panel note',()=>{
 const code=(fn:()=>unknown)=>{try{fn();}catch(e){assert.ok(e instanceof TextToPathError);assert.equal((e as TextToPathError).expected,true);return (e as TextToPathError).code;}throw new Error('no throw');};
 assert.equal(code(()=>textToOutlinePaths(font,T({text:'  '}))),'empty');
 assert.equal(code(()=>textToOutlinePaths(font,T({text:'a'.repeat(2001)}))),'tooLong');
 assert.equal(code(()=>textToOutlinePaths(font,T({text:'一'}))),'missingGlyph');
 assert.equal(code(()=>textToOutlinePaths(font,T({fontSize:0}))),'badSize');
 assert.equal(code(()=>textToOutlinePaths(font,T({rotation:400}))),'badRotation');
 assert.equal(code(()=>textToPathCommit(doc(T({locked:true})),'t1',font)),'locked');
 assert.equal(code(()=>textToPathCommit(doc(T()),'nope',font)),'unknownText');
});
