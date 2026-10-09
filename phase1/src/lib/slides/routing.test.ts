import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addMediaFile,clearMedia,findMedia,getMedia,MEDIA_FILE,setActiveMedia} from '../media';
import {patchState,getState,openFileTab} from '../../store/appStore';
import {deriveContext} from '../uiContext';
import {startStudioRouting} from '../studios/studioRouting';
test('PPTX routes via existing media identity, respects manual Studio and readonly context',async()=>{
 const stopRouting=startStudioRouting();clearMedia();patchState({studioChoice:'automatic',activeStudio:'code',activeFile:'index.html',files:{'index.html':'<p>Keep me</p>'},studioByTab:{}});
 assert.ok(MEDIA_FILE.test('decks/a.pptx'));
 const blob=new Blob([readFileSync('slides-engine/fixtures/independent.pptx')]);
 const r=await addMediaFile(blob,'a.pptx','decks/a.pptx');assert.ok('name'in r);assert.equal(findMedia('decks/a.pptx')?.kind,'pptx');assert.equal(getState().activeStudio,'slides');
 assert.equal(getState().studioByTab['index.html'],undefined);assert.equal(getState().studioByTab['media:decks/a.pptx'],'slides');
 const context=deriveContext(getState(),{media:{name:'decks/a.pptx',kind:'pptx'}});assert.equal(context.domain,'media-readonly');assert.equal(context.flags.readonly,true);assert.equal(context.file,'decks/a.pptx');
 patchState({studioChoice:'manual',activeStudio:'code'});setActiveMedia('decks/a.pptx');assert.equal(getState().activeStudio,'code');clearMedia();patchState({studioChoice:'automatic'});stopRouting();
});
test('folder media loader delivers PPTX binary identity through safe project port',async()=>{
 const {loadFolderMedia}=await import('../folderMedia');clearMedia();patchState({studioChoice:'automatic',activeStudio:'code'});const stop=startStudioRouting();const bytes=readFileSync('slides-engine/fixtures/independent.pptx');
 const result=await loadFolderMedia(async<T>(command:string,args?:Record<string,unknown>)=>{assert.equal(command,'read_media');assert.equal(args?.path,'presentations/deck.pptx');return bytes.toString('base64') as T;},'project-id',['presentations/deck.pptx']);
 assert.deepEqual(result.loaded,['presentations/deck.pptx']);assert.equal(findMedia('presentations/deck.pptx')?.kind,'pptx');assert.equal(getState().activeStudio,'code','background folder load never routes');assert.equal(getMedia().active,null);stop();clearMedia();
});
