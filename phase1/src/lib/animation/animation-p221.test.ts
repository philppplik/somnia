import test from 'node:test';import assert from 'node:assert/strict';
import {exportPlan,settingsProblems,defaultExportSettings} from './exportSettings';
import {frameSvg} from './exportFrames';
const comp:any={id:'c',name:'c',width:800,height:450,fps:{num:30,den:1},duration:240000*2,start:0,background:'#000000',workArea:{in:0,out:480000},layers:[]};
test('crop sets output size and scales',()=>{
 const s={...defaultExportSettings(),crop:{x:100,y:50,width:200,height:100}};
 const p=exportPlan(comp,'sheet',s);assert.equal(p.width,200);assert.equal(p.height,100);assert.equal(p.problems.length,0);
 const q=exportPlan(comp,'gif',{...s,scale:50});assert.equal(q.width,100);assert.equal(q.height,50);
});
test('crop problems',()=>{
 const d=defaultExportSettings();
 assert.ok(settingsProblems({...d,crop:{x:-1,y:0,width:10,height:10}}).includes('crop'));
 assert.ok(settingsProblems({...d,crop:{x:0,y:0,width:1.5,height:10}}).includes('crop'));
 assert.ok(exportPlan(comp,'gif',{...d,crop:{x:700,y:0,width:200,height:100}}).problems.includes('crop'));
 assert.equal(settingsProblems({...d,crop:null}).length,0);
});
test('frame svg shifts by view origin',()=>{
 const svg=frameSvg({...comp,width:200,height:100,viewOrigin:{x:100,y:50}},0);
 assert.match(svg,/width="200" height="100"/);assert.match(svg,/translate\(-100 -50\)/);
 assert.doesNotMatch(frameSvg(comp,0),/translate\(/);
});
