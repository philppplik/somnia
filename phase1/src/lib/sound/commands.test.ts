import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandDispatcher} from '../commandDispatcher';
import {soundCommandSpecs,registerSoundTransport,registerSoundCommands,registerSoundExportOpener} from './commands';
import {addMediaFile,getMedia,clearMedia} from '../media';
import {setSoundEngineFactory,openSound,getSoundSession,isSoundExportReady,saveSound} from './session';
import {commandRegistry} from '../commandRegistry';
import {DEFAULT_SETTINGS} from './recipe';
import {soundShell,SOUND_LAYOUT,soundStudio} from '../studios/sound';
import {validateStudioShell,resolveInspectorSections,stackPanels} from '../shell/panels';
import {hasRailIcon} from '../shell/railIcons';
import {editRailOverrides,railModel} from '../../store/railActions';
import {SOUND_CATALOGUES} from './i18n';
import '../../components/shell/railIconSet';
const specs=soundCommandSpecs();
test('sound manifest validates; defaults and customization stay studio-local',()=>{
 const ids=new Set(specs.map(s=>s.id));
 assert.deepEqual(validateStudioShell('sound',soundShell,{commandExists:id=>ids.has(id),hostExists:id=>['code.files','sound.clips','sound.selection','sound.effects','shell.inspector'].includes(id),sectionHostExists:id=>['sound.inspector.source','sound.inspector.levels','sound.inspector.processing'].includes(id),iconExists:hasRailIcon}),[]);
 const ctx={studio:'sound',services:{ready:false},selection:{kind:'none',count:0}};
 assert.deepEqual(resolveInspectorSections(soundShell.inspector!.sections,ctx).map(s=>s.id),['source']);
 assert.deepEqual(resolveInspectorSections(soundShell.inspector!.sections,{...ctx,services:{ready:true}}).map(s=>s.id),['source','levels','processing']);
 assert.deepEqual(stackPanels(soundShell.panels!,'left',SOUND_LAYOUT.leftPanels,ctx).map(s=>s.id),['clips']);
 const custom=editRailOverrides(soundStudio,undefined,'unpin',{side:'left',id:'selection'},ctx)!;
 assert.deepEqual(railModel(soundStudio,'left',custom,ctx).overflow.map(s=>s.id),['selection']);
 assert.deepEqual(railModel(soundStudio,'right',custom,ctx).visible.map(s=>s.id),['inspector','effects']);
});
test('sound locale keys and command titles have parity in five languages',()=>{
 const keys=Object.keys(SOUND_CATALOGUES.en).sort();
 for(const [locale,cat] of Object.entries(SOUND_CATALOGUES)){assert.deepEqual(Object.keys(cat).sort(),keys,locale);for(const s of specs)assert.ok(cat['cmd.'+s.id]);}
});
test('typed commands change a real session via a mocked engine, enforce origins, payloads and lifecycle',async()=>{
 const stats={frames:100,sample_rate:44100,channels:2,duration_s:8,peak_db:-2,rms_db:-12};
 setSoundEngineFactory(()=>({init:async()=>[],dispose(){},process:async()=>({wav:new ArrayBuffer(44),peaks:new Float32Array(20),ms:0,report:{format:'wav',input:stats,output:stats,steps:[],trimmed_range:null,wav_bytes:44}})}));
 const bytes=new Uint8Array(44);bytes.set(new TextEncoder().encode('RIFF'));bytes.set(new TextEncoder().encode('WAVE'),8);
 await addMediaFile(new Blob([bytes],{type:'audio/wav'}),'shell.wav');await openSound(getMedia().items[0]);
 const d=new CommandDispatcher();const offs=soundCommandSpecs().map(s=>d.register(s));
 try{
  await assert.rejects(d.runCommand('sound.settings.set',{settings:DEFAULT_SETTINGS},{origin:'agent'}),/interactive-only/);
  await assert.rejects(d.runCommand('sound.selection.set',{start:'bad',end:4}),/Invalid parameters/);
  let opened='';const closeOpener=registerSoundExportOpener(n=>{opened=n;});
  await d.runCommand('sound.export.open');assert.equal(opened,'shell.wav');closeOpener();assert.equal(d.isEnabled('sound.export.open'),false);
  await d.runCommand('sound.selection.set',{start:2,end:6});assert.deepEqual(getSoundSession('shell.wav')?.selection,{start:2,end:6});
  await d.runCommand('sound.region.apply',{mode:'crop'});assert.equal(getSoundSession('shell.wav')?.settings.region?.mode,'crop');
  assert.equal(isSoundExportReady('shell.wav'),false,'queued rendering cannot export stale audio');
  assert.equal(await saveSound('shell.wav'),'unavailable');
  await d.runCommand('sound.region.clear');await d.runCommand('sound.selection.all');assert.deepEqual(getSoundSession('shell.wav')?.selection,{start:0,end:8});
  await d.runCommand('sound.settings.set',{settings:{...DEFAULT_SETTINGS,pitch:7,effect:{id:'',keepTail:true,params:{mix:0.5}}}});assert.equal(getSoundSession('shell.wav')?.settings.pitch,7);
  await assert.rejects(d.runCommand('sound.settings.set',{settings:{...DEFAULT_SETTINGS,effect:{id:'',keepTail:true,params:{mix:'bad'}}}}),/Invalid parameters/);
  await d.runCommand('sound.listen',{version:'original'});assert.equal(getSoundSession('shell.wav')?.listen,'original');
  let toggles=0,at=-1;const off=registerSoundTransport({name:'shell.wav',toggle:()=>{toggles++;},seek:n=>{at=n;}});
  await d.runCommand('sound.transport.toggle');await d.runCommand('sound.transport.seek',{seconds:3});assert.equal(toggles,1);assert.equal(at,3);off();assert.equal(d.isEnabled('sound.transport.toggle'),false);
  await d.runCommand('sound.settings.reset');assert.deepEqual(getSoundSession('shell.wav')?.settings,DEFAULT_SETTINGS);
 }finally{offs.forEach(f=>f());clearMedia();}
 assert.equal(d.has('sound.settings.set'),false);
});

test('Sound canvas and Code preview can share command registration without duplicates',()=>{const a=registerSoundCommands(),b=registerSoundCommands();assert.ok(commandRegistry.has('sound.settings.set'));a();a();assert.ok(commandRegistry.has('sound.settings.set'));b();assert.equal(commandRegistry.has('sound.settings.set'),false);});
