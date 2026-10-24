import test from 'node:test';
import assert from 'node:assert/strict';
import {videoExportSchema,videoOptionsToValues,valuesToVideoOptions,videoSessionPatch,videoExportFileName,VIDEO_EXPORT_DEFAULTS as D,type VideoExportContext} from './exportAdvanced';
import {sanitizeExportOptions} from './recipe';
import {EXPORT_GROUP_IDS} from '../exportCenter';
const ctx=(o:Partial<VideoExportContext>={}):VideoExportContext=>({total:10,formats:{webm:true,mp4:true},silent:()=>false,hasClips:true,...o});
const ok=(o:Partial<typeof D>={})=>videoOptionsToValues({...D,name:'cut',rangeEnd:10,...o});
test('schema validates name, timeline, encoder, range and the silent notice',()=>{
 const s=videoExportSchema(ctx());
 assert.equal(s.validate(videoOptionsToValues(D)),'export.error.name');
 assert.equal(s.validate(ok()),null);
 assert.equal(videoExportSchema(ctx({hasClips:false})).validate(ok()),'export.error.empty');
 assert.equal(videoExportSchema(ctx({formats:{webm:true,mp4:false}})).validate(ok({format:'mp4'})),'export.error.format');
 assert.equal(s.validate(ok({useRange:true,rangeStart:2,rangeEnd:2.01})),'export.error.range');
 assert.equal(s.validate(ok({useRange:true,rangeStart:-1,rangeEnd:4})),'export.error.range');
 assert.equal(s.validate(ok({useRange:true,rangeStart:2,rangeEnd:11})),'export.error.range');
 assert.equal(s.validate(ok({useRange:true,rangeStart:2,rangeEnd:4})),null);
 const silent=videoExportSchema(ctx({silent:f=>f==='mp4'}));
 assert.equal(silent.validate(ok({format:'mp4'})),'export.error.silent');
 assert.equal(silent.validate(ok({format:'mp4',silentOk:true})),null);
 assert.equal(silent.validate(ok({format:'webm'})),null);
});
test('format list follows the encoders the browser has; range and notice fields show only when relevant',()=>{
 const s=videoExportSchema(ctx({formats:{webm:false,mp4:true},silent:f=>f==='mp4'}));
 assert.deepEqual(s.fields[0].options!.map(o=>o.value),['mp4']);
 assert.equal(s.defaults.format,'mp4');
 const vis=(v:Record<string,string|number|boolean>)=>s.fields.filter(f=>!f.visibleWhen||f.visibleWhen(v)).map(f=>f.id);
 assert.ok(!vis({useRange:false,format:'webm'}).includes('rangeStart'));assert.ok(vis({useRange:true,format:'mp4'}).includes('rangeEnd'));
 assert.ok(vis({format:'mp4'}).includes('silentOk'));assert.ok(!vis({format:'webm'}).includes('silentOk'));
});
test('select values round-trip as strings and bad input falls back',()=>{
 const o=valuesToVideoOptions(videoOptionsToValues({...D,name:' x ',scale:0.5,fps:30,aspect:'9:16',quality:'low',format:'mp4'}));
 assert.deepEqual([o.name,o.scale,o.fps,o.aspect,o.quality,o.format],['x',0.5,30,'9:16','low','mp4']);
 const bad=valuesToVideoOptions({scale:'3',fps:'12',aspect:'2:1',quality:'ultra',format:'avi'});
 assert.deepEqual([bad.scale,bad.fps,bad.aspect,bad.quality,bad.format],[1,0,'source','high','webm']);
});
test('session patch is accepted unchanged by the session sanitiser; fps 0 means native',()=>{
 const p=videoSessionPatch({...D,name:'a',scale:0.25,fps:50,aspect:'1:1',quality:'medium',format:'mp4',useRange:true,rangeStart:1,rangeEnd:3},10);
 assert.deepEqual(sanitizeExportOptions(p.options),p.options);assert.deepEqual(p.range,{start:1,end:3});assert.equal(p.format,'mp4');
 assert.equal(videoSessionPatch({...D,name:'a'},10).options.fps,null);
 assert.equal(videoSessionPatch({...D,name:'a'},10).range,null);
 assert.deepEqual(videoSessionPatch({...D,name:'a',useRange:true,rangeStart:0,rangeEnd:99},10).range,{start:0,end:10});
});
test('file name: one extension, no path characters',()=>{
 assert.equal(videoExportFileName('clip.mp4','mp4'),'clip.mp4');assert.equal(videoExportFileName('clip','webm'),'clip.webm');
 assert.equal(videoExportFileName('a/b','mp4'),'a_b.mp4');assert.equal(videoExportFileName(' ','webm'),'video.webm');
});
test('export center lists the advanced command first for video',()=>{assert.equal(EXPORT_GROUP_IDS.video[0],'video.export.advanced');});
