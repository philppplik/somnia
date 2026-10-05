import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorProject,type EditorNode} from './index.js';
// Differential test: every partial reparse must equal a full reparse (tree shape, offsets, parse5 locations). verify=true throws on any difference.
let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const pick=<T>(a:T[])=>a[Math.floor(rnd()*a.length)];
const frags=['text','<b>x</b>','<div class="a">y</div>','<span>z</span>','</div>','<p>open','<section><h2>t</h2></section>','<ul><li>a<li>b</ul>','<br>','<!-- c -->','&amp; ent','<table><tr><td>c</td></tr></table>','<div>','<img src="a.png">','<a href="#">l</a>','<script>var a=1</script>','</p>',' ','\n','<custom-el>q</custom-el>','<svg><circle/></svg>','<b><p>mis</b>x</p>','<input value="v">'];
const base=`<!doctype html><html><head><title>t</title><style>.a{color:red}</style></head><body>\n<main id="m"><section class="s"><h2>One</h2><p>Para <em>x</em></p><div><span>in</span><div class="deep">d</div></div></section>\n<section><ul><li>a</li><li>b</li></ul></section></main>\n<footer>f &amp; g</footer></body></html>`;
for(const s0 of [12345,777,99991,4242,31337,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15])test(`partial reparse equals full reparse over random edits (seed ${s0})`,()=>{seed=s0;
 EditorProject.incremental.enabled=true;EditorProject.incremental.verify=true;EditorProject.incremental.hits=0;EditorProject.incremental.misses=0;
 try{
  for(let round=0;round<60;round++){
   const p=new EditorProject({'index.html':base});
   for(let i=0;i<25;i++){
    const src=p.files['index.html'];const all:EditorNode[]=[];const col=(ns:EditorNode[])=>{for(const n of ns){all.push(n);col(n.children);}};col(p.tree('index.html'));const host=pick(all.filter(n=>n.contentTo>n.contentFrom||rnd()<.5)),inside=rnd()<.85&&host;const lo=inside?host.contentFrom:0,hi=inside?host.contentTo:src.length;const a=lo+Math.floor(rnd()*(hi-lo+1)),b=Math.min(hi,a+Math.floor(rnd()*(rnd()<.7?4:30)));
    const text=src.slice(0,a)+(rnd()<.8?pick(frags):'')+src.slice(b);
    p.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text}]});
    if(rnd()<.15)p.undo();if(rnd()<.35)p.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text:base}]});
   }
  }
 }finally{EditorProject.incremental.enabled=false;EditorProject.incremental.verify=false;}
 console.log('partial hits',EditorProject.incremental.hits,'full fallbacks',EditorProject.incremental.misses);
 assert.ok(EditorProject.incremental.hits>30,'partial path must actually be exercised');
});
test('ids of untouched nodes survive a partial reparse',()=>{
 EditorProject.incremental.enabled=true;try{
  const p=new EditorProject({'index.html':base});const ids=(ns:EditorNode[]):string[]=>ns.flatMap(n=>[n.tag+n.id,...ids(n.children)]);
  const before=ids(p.tree('index.html'));const src=p.files['index.html'];
  p.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text:src.replace('f &amp; g','f and g')}]});
  assert.deepEqual(ids(p.tree('index.html')),before);
 }finally{EditorProject.incremental.enabled=false;}
});

test('typing in text and attributes mostly takes the partial path and matches full reparse',()=>{
 seed=2024;EditorProject.incremental.enabled=true;EditorProject.incremental.verify=true;EditorProject.incremental.hits=0;EditorProject.incremental.misses=0;
 try{
  const p=new EditorProject({'index.html':base});
  for(let i=0;i<300;i++){
   const src=p.files['index.html'];const all:EditorNode[]=[];const col=(ns:EditorNode[])=>{for(const n of ns){all.push(n);col(n.children);}};col(p.tree('index.html'));
   const host=pick(all.filter(n=>n.contentTo>n.contentFrom&&n.tag!=='style'&&n.tag!=='title'));const at=pick([host.contentFrom,host.contentTo,...host.children.flatMap(c=>[c.from,c.to])]);
   const ins=pick(['a','word ',' ','é','<span>w</span>','<div>x</div>','<!-- n -->','<br>']);
   p.transact({origin:'code',operations:[{type:'replaceSource',file:'index.html',text:src.slice(0,at)+ins+src.slice(at)}]});
  }
 }finally{EditorProject.incremental.enabled=false;EditorProject.incremental.verify=false;}
 console.log('typing hits',EditorProject.incremental.hits,'misses',EditorProject.incremental.misses);assert.ok(EditorProject.incremental.hits>EditorProject.incremental.misses,'ordinary edits should mostly take the partial path');
});
