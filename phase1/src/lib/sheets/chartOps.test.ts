import test from 'node:test';import assert from 'node:assert/strict';
import {parseChartCommand,parseCharts,parsePrims,parseScene,parseSparklineCommand,parseSparklines,sceneToSvg,sparklineBlockProblem,svgDataUrl} from './chartOps';
test('chart commands accept the closed allowlist',()=>{
 assert.deepEqual(parseChartCommand({kind:'create',type:'line',subtype:'markers',title:'Sales'}),{kind:'create',type:'line',subtype:'markers',title:'Sales'});
 assert.deepEqual(parseChartCommand({kind:'create'}),{kind:'create'});
 assert.deepEqual(parseChartCommand({kind:'set',chart:3,legend:'none',dataLabels:true,style:16,at:'h2',width:480,height:288,xTitle:'X'}),{kind:'set',chart:3,xTitle:'X',legend:'none',dataLabels:true,style:16,at:'H2',width:480,height:288});
 assert.deepEqual(parseChartCommand({kind:'delete',chart:0}),{kind:'delete',chart:0});assert.deepEqual(parseChartCommand({kind:'switch',chart:7}),{kind:'switch',chart:7});
});
test('chart commands refuse malformed input',()=>{
 for(const bad of [null,[],'x',{},{kind:'burn'},{kind:'create',type:'bubble'},{kind:'create',subtype:'x'},{kind:'create',extra:1},{kind:'create',title:'a\u0007'},{kind:'create',title:'x'.repeat(121)},{kind:'set'},{kind:'set',chart:1},{kind:'set',chart:-1,title:'a'},{kind:'set',chart:1.5,title:'a'},{kind:'set',chart:1,style:17},{kind:'set',chart:1,style:0},{kind:'set',chart:1,legend:'middle'},{kind:'set',chart:1,dataLabels:'y'},{kind:'set',chart:1,at:'nope'},{kind:'set',chart:1,width:19},{kind:'set',chart:1,height:4001},{kind:'delete'},{kind:'delete',chart:1,x:1}])
  assert.throws(()=>parseChartCommand(bad),JSON.stringify(bad));
});
test('sparkline commands and blocks',()=>{
 assert.deepEqual(parseSparklineCommand(undefined),{});assert.deepEqual(parseSparklineCommand({type:'winLoss',markers:true}),{type:'winLoss',markers:true});
 for(const bad of [null,[],{type:'pie'},{markers:'y'},{x:1}])assert.throws(()=>parseSparklineCommand(bad));
 assert.equal(sparklineBlockProblem(1,5),null);assert.equal(sparklineBlockProblem(500,1),null);assert.equal(sparklineBlockProblem(501,1),'shape');assert.equal(sparklineBlockProblem(1,1),'shape');assert.equal(sparklineBlockProblem(2,2),'shape');assert.equal(sparklineBlockProblem(1.5,3),'shape');
});
test('bridge lists are bounded',()=>{
 assert.deepEqual(parseCharts('x'),[]);
 const list=parseCharts([{id:1,kind:'Line',title:'T',row:2,col:3,dx:0,dy:0,width:480,height:288,legend:'Bottom',dataLabels:true,gridlines:false,style:2,series:3},{id:-1},null,{id:2,width:99999,height:'x'}]);
 assert.equal(list.length,2);assert.equal(list[0].title,'T');assert.equal(list[1].width,4000);assert.equal(list[1].height,288);
 assert.equal(parseCharts(Array.from({length:80},(_,i)=>({id:i}))).length,50);
 assert.deepEqual(parseSparklines([{row:1,col:2,width:30,height:20,prims:[]},{row:-1,col:0,width:1,height:1,prims:[]},{row:0,col:99999,width:1,height:1,prims:[]}]).map(s=>[s.row,s.col]),[[1,2]]);
 assert.equal(parseScene(null),null);assert.equal(parseScene({width:0,height:5}),null);
});
test('primitives are parsed strictly and drawn as escaped svg',()=>{
 const prims=parsePrims([
  {Rect:{x:0,y:0,w:10,h:5,fill:[255,0,0,255],stroke:[[0,0,0,255],1],radius:2}},{Line:{pts:[[0,0],[5,5]],color:[0,0,255,255],width:1.5,dash:true}},{Polygon:{pts:[[0,0],[5,0],[5,5]],fill:[1,2,3,255],stroke:null}},
  {Wedge:{cx:50,cy:50,r_outer:40,r_inner:20,a0:0,a1:1.5,fill:[9,9,9,255],stroke:null}},{Wedge:{cx:50,cy:50,r_outer:40,r_inner:0,a0:0,a1:6.2832,fill:[9,9,9,255],stroke:null}},{Circle:{cx:1,cy:1,r:2,fill:null,stroke:[[0,0,0,255],1]}},
  {Text:{x:5,y:5,text:'<b onload="x">&\'',size:9,color:[0,0,0,255],bold:true,align:'Center',valign:'Middle',rotation:1.57}},
  {Rect:{x:'a',y:0,w:1,h:1,fill:null,stroke:null,radius:0}},{Rect:{x:0,y:0,w:1,h:1,fill:[300,0,0,255],stroke:null,radius:0}},{Line:{pts:[[0,NaN]],color:[0,0,0,255],width:1}},{Evil:{}},null,5]);
 assert.equal(prims.length,8);
 const svg=sceneToSvg({width:100,height:80,prims});
 assert.match(svg,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="100" height="80"/);
 assert.ok(!svg.includes('<b onload')&&svg.includes('&lt;b onload=&quot;x&quot;&gt;&amp;&#39;'));
 assert.ok(!/<script|href=|javascript:/i.test(svg));
 assert.ok(svg.includes('<path')&&svg.includes('rotate('));
 assert.ok(svgDataUrl(svg).startsWith('data:image/svg+xml;charset=utf-8,%3Csvg'));
 assert.equal(parsePrims(Array.from({length:30000},()=>({Circle:{cx:0,cy:0,r:1,fill:null,stroke:null}}))).length,20000);
});
