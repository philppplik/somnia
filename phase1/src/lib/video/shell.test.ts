import test from 'node:test';
import assert from 'node:assert/strict';
import {videoShell,videoStudio} from '../studios/video';
import {resolveInspectorSections,validateStudioShell} from '../shell/panels';
import {hasRailIcon} from '../shell/railIcons';
import '../../components/shell/railIconSet';
import {railModel,editRailOverrides} from '../../store/railActions';
import {VIDEO_CATALOGUES} from './i18n';
import {VIDEO_COMMANDS,videoCommandSpecs,registerVideoExportOpener} from './commands';
import {CommandDispatcher} from '../commandDispatcher';
import {addBlankVideoProject,getMedia,closeMedia} from '../media';
import {openVideo,getVideoSession,closeVideo} from './session';
const context=(selected=false,ready=false,exporting=false)=>({studio:'video',selection:{kind:selected?'one':'none',count:selected?1:0},services:{ready,exporting}});
test('video manifest validates real icons, hosts and commands',()=>{
 const hosts=new Set(['code.files','shell.inspector','video.sources','video.sequence']);
 const sections=new Set(['video.inspector.document','video.inspector.selection','video.inspector.audio','video.inspector.export']);
 assert.deepEqual(validateStudioShell('video',videoShell,{hostExists:id=>hosts.has(id),sectionHostExists:id=>sections.has(id),commandExists:id=>VIDEO_COMMANDS.includes(id),iconExists:hasRailIcon}),[]);
 assert.equal(videoStudio.shellV2,videoShell);
});
test('inspector handles empty, selected, ready and exporting contexts',()=>{
 const ids=(c:unknown)=>resolveInspectorSections(videoShell.inspector!.sections,c).map(s=>s.id);
 assert.deepEqual(ids(context()),['document']);
 assert.deepEqual(ids(context(false,true)),['document','export']);
 assert.deepEqual(ids(context(true,true)),['document','selection','audio','export']);
 assert.deepEqual(ids(context(true,false,true)),['document','selection','audio','export']);
});
test('video customization defaults, overflow and independent sides',()=>{
 const ctx=context(false,true);
 const left=railModel(videoStudio,'left',undefined,ctx);
 assert.deepEqual(left.visible.map(i=>i.id),['files','sources','sequence']);
 assert.deepEqual(left.overflow.map(i=>i.id),['addTitle']);
 const hidden=editRailOverrides(videoStudio,undefined,'hide',{side:'left',id:'sources'},ctx)!;
 assert.deepEqual(railModel(videoStudio,'left',hidden,ctx).visible.map(i=>i.id),['files','sequence']);
 assert.deepEqual(railModel(videoStudio,'right',hidden,ctx).visible.map(i=>i.id),['inspector']);
 assert.equal(railModel(videoStudio,'left',undefined,context()).overflow.length,0);
});
test('all video shell and command titles have matching five-locale keys',()=>{
 const en=Object.keys(VIDEO_CATALOGUES.en).sort();
 for(const tag of ['de','es','fr','pt-BR'])assert.deepEqual(Object.keys(VIDEO_CATALOGUES[tag]).sort(),en);
 for(const id of VIDEO_COMMANDS)for(const catalogue of Object.values(VIDEO_CATALOGUES))assert.ok(catalogue['cmd.'+id]);
 for(const panel of videoShell.panels!)assert.ok(VIDEO_CATALOGUES.en[panel.titleKey!]);
});
test('typed video commands edit only the active timeline, refuse stale ids and unsafe origins',async()=>{
 addBlankVideoProject('shell-test.somnia-video');const name=getMedia().active!;const item=getMedia().items.find(i=>i.name===name)!;
 await openVideo(item);
 const d=new CommandDispatcher();videoCommandSpecs().forEach(s=>d.register(s));
 try{
  let review='';const offReview=registerVideoExportOpener(n=>{review=n;});
  await d.runCommand('video.export.open');assert.equal(review,name);offReview();assert.equal(d.isEnabled('video.export.open'),false);
  await assert.rejects(d.runCommand('video.export.open',undefined,{origin:'agent'}));
  await d.runCommand('video.title.add',undefined,{origin:'test'});
  const first=getVideoSession(name)!.clips[0];assert.equal(first.kind,'title');
  await d.runCommand('video.title.update',{text:'First scene',background:'#123456'},{origin:'test'});
  await d.runCommand('video.title.duration',{seconds:5},{origin:'test'});
  assert.equal(getVideoSession(name)!.clips[0].out_s,5);
  await assert.rejects(d.runCommand('video.title.duration',{seconds:-1},{origin:'test'}),/parameters|params/i);
  await assert.rejects(d.runCommand('video.title.update',{untrusted:1},{origin:'test'}),/parameters|params/i);
  await assert.rejects(d.runCommand('video.clip.select',{id:'not-here'},{origin:'test'}),/not in/);
  await assert.rejects(d.runCommand('video.title.add',undefined,{origin:'agent'}));
  await assert.rejects(d.runCommand('video.clip.gain',{gain:1},{origin:'test'}),/not available/i);
  await d.runCommand('video.title.add',undefined,{origin:'test'});
  await d.runCommand('video.clip.move',{by:-1},{origin:'test'});
  assert.notEqual(getVideoSession(name)!.clips[0].id,first.id);
  await d.runCommand('video.clip.crossfade',{seconds:0.5},{origin:'test'});
  await d.runCommand('video.timeline.split',{seconds:1},{origin:'test'});
  assert.equal(getVideoSession(name)!.clips.length,3);
  await d.runCommand('video.clip.select',{id:first.id},{origin:'test'});
  await d.runCommand('video.clip.delete',undefined,{origin:'test'});
  assert.equal(getVideoSession(name)!.clips.length,2);
  await d.runCommand('video.timeline.reset',undefined,{origin:'test'});
  assert.equal(getVideoSession(name)!.clips.length,0);
  await assert.rejects(d.runCommand('video.export.start',undefined,{origin:'test'}),/not available/i);
  await assert.rejects(d.runCommand('video.clip.deselect',undefined,{origin:'test'}),/not available/i);
 }finally{closeVideo(name);closeMedia(name);}
});
