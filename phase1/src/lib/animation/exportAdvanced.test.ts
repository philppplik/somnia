import test from 'node:test';
import assert from 'node:assert/strict';
import {animationExportSchema,animationFileStem,animationOptionsToValues,animationProblem,animationSettings,animationTransparent,hasAlpha,valuesToAnimationOptions,ANIMATION_EXPORT_DEFAULTS as D,type AnimationAdvancedOptions} from './exportAdvanced';
import {settingsProblems,defaultExportSettings,type ExportSettings} from './exportSettings';
import {createDocument,findComp} from './model';
import {EXPORT_GROUP_IDS} from '../exportCenter';
const comp=()=>findComp(createDocument())!;
const o=(x:Partial<AnimationAdvancedOptions>={}):AnimationAdvancedOptions=>({...D,name:'clip',...x});
const vals=(x:Partial<AnimationAdvancedOptions>={})=>animationOptionsToValues(o(x));
test('schema: composition, name, selection and range are validated',()=>{
 const s=animationExportSchema({comp:comp(),selected:0});
 assert.equal(s.validate(animationOptionsToValues(D)),'export.error.name');
 assert.equal(s.validate(vals()),null);
 assert.equal(animationExportSchema({comp:null,selected:0}).validate(vals()),'export.error.empty');
 assert.equal(s.validate(vals({selectedOnly:true})),'export.error.selection');
 assert.equal(animationExportSchema({comp:comp(),selected:1}).validate(vals({selectedOnly:true})),null);
 assert.equal(s.validate(vals({scale:5})),'export.error.animation');
 assert.equal(s.validate(vals({scale:400,output:'webm'})),null);
 assert.equal(s.validate(vals({useRange:true,rangeStart:5,rangeEnd:2})),'export.error.animation');
 assert.equal(s.validate(vals({useRange:true,rangeStart:0,rangeEnd:99999})),'export.error.animation');
 assert.equal(s.validate(vals({output:'png',useRange:true,rangeStart:9,rangeEnd:2})),null,'a still has no range');
});
test('fields show per output',()=>{
 const s=animationExportSchema({comp:comp(),selected:0});const vis=(v:Record<string,string|number|boolean>)=>s.fields.filter(f=>!f.visibleWhen||f.visibleWhen(v)).map(f=>f.id);
 assert.deepEqual(vis({output:'png'}),['output','name','scale','transparent','selectedOnly']);
 assert.deepEqual(vis({output:'jpeg'}),['output','name','scale','frameQuality','selectedOnly']);
 assert.deepEqual(vis({output:'gif'}),['output','name','scale','fps','colors','dither','loop','loopSeam','selectedOnly','useRange']);
 assert.deepEqual(vis({output:'webm',useRange:true}),['output','name','scale','fps','webmQuality','selectedOnly','useRange','rangeStart','rangeEnd']);
 assert.deepEqual(vis({output:'sheet'}),['output','name','scale','fps','transparent','columns','padding','selectedOnly','useRange']);
});
test('options: bad input falls back to defaults',()=>{
 const x=valuesToAnimationOptions({output:'mov',colors:'7',webmQuality:'ultra',fps:'7'});
 assert.deepEqual([x.output,x.colors,x.webmQuality,x.fps],['gif',256,'medium',0]);
});
test('settings: every output yields settings the session accepts',()=>{
 for(const out of ['png','jpeg','webp','sequence','gif','apng','webm','sheet'] as const){
  const s={...defaultExportSettings(),...animationSettings(o({output:out,fps:24,columns:4,padding:2,useRange:true,rangeStart:1,rangeEnd:3}))} as ExportSettings;
  assert.deepEqual(settingsProblems(s),[],out);
 }
 const g=animationSettings(o({fps:0,columns:0}));assert.equal(g.fps,null);assert.equal(g.columns,null);assert.equal(g.from,null);assert.equal(g.to,null);
 assert.equal(animationSettings(o({output:'jpeg'})).frameFormat,'jpeg');assert.equal(animationSettings(o({output:'gif'})).frameFormat,'png');
});
test('transparency only applies where the format has alpha',()=>{
 assert.deepEqual(['png','jpeg','webp','sequence','gif','apng','webm','sheet'].map(x=>hasAlpha(x as never)),[true,false,true,true,false,true,false,true]);
 assert.equal(animationTransparent(o({output:'gif',transparent:true})),false);
 assert.equal(animationTransparent(o({output:'apng',transparent:true})),true);
});
test('file stem drops extensions and path characters',()=>{
 assert.equal(animationFileStem('a/b\\hero.gif'),'a_b_hero');assert.equal(animationFileStem('..'),'');assert.equal(animationProblem(o({name:'  '}),comp(),0),'export.error.name');
});
test('export center lists the advanced command first for animation',()=>{assert.equal(EXPORT_GROUP_IDS.animation[0],'animation.export.advanced');});
