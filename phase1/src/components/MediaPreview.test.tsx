import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {FileTabs} from './FileTabs';
import {MediaViewer} from './MediaPreview';
import {SlidesCanvas} from './slides/SlidesCanvas';
import {getState,patchState,requestStudio,closeCore,connectEditorProject} from '../store/appStore';
import {EditorProject} from '../../packages/editor-core/src/index';
import {addMediaFile,getMedia} from '../lib/media';
import {readFileSync} from 'node:fs';
import {scopedFiles} from '../lib/tabScope';

afterEach(()=>{closeCore();patchState({activeStudio:'code',studioChoice:'automatic',studioByTab:{}});});

test('returning from a PPTX to Code renders one source tab, not a nested Slides tab strip',async()=>{
 closeCore();patchState({activeStudio:'code',studioChoice:'automatic',studioByTab:{}});
 connectEditorProject(new EditorProject({'index.html':'<h1>Source stays intact</h1>'}));
 assert.deepEqual(getState().openFiles,['index.html']);
 requestStudio('slides');
 assert.deepEqual(scopedFiles(getState().openFiles,'slides',getState().studioByTab),[]);
 const result=await addMediaFile(new Blob([readFileSync('slides-engine/fixtures/independent.pptx')]),'independent.pptx');
 assert.ok(!('error' in result));
 requestStudio('slides','open');
 assert.deepEqual(getState().openFiles,['index.html'],'opening the deck did not duplicate source state');
 requestStudio('code');
 assert.equal(getMedia().active,'independent.pptx','manual Studio visits retain the active preview');
 assert.deepEqual(scopedFiles(getState().openFiles,'code',getState().studioByTab),['index.html']);
 const item=getMedia().items.find(m=>m.name===getMedia().active)!;
 // Canvas owns FileTabs; the media preview must not render another copy.
 const html=renderToStaticMarkup(<><FileTabs/><MediaViewer item={item}/></>);
 assert.equal((html.match(/role="tablist"/g)||[]).length,1);
 assert.equal((html.match(/role="tab"[^>]*title="index.html"/g)||[]).length,1);
 // MediaViewer is lazy on perf/integrated: static markup shows only the Suspense fallback, so the preview itself is checked directly.
 assert.match(renderToStaticMarkup(<SlidesCanvas embedded/>),/aria-label="Slides Studio"/,'the embedded presentation preview remains available');
 assert.match(readFileSync('src/components/MediaPreview.tsx','utf8'),/<SlidesCanvas[^>]*\bembedded\b/,'MediaViewer embeds Slides without its own tab strip');
});

test('standalone Slides canvas retains its own shared tabs, embedded Slides does not',()=>{
 patchState({activeStudio:'slides',studioByTab:{}});
 assert.equal((renderToStaticMarkup(<SlidesCanvas/>).match(/role="tablist"/g)||[]).length,1);
 assert.equal((renderToStaticMarkup(<SlidesCanvas embedded/>).match(/role="tablist"/g)||[]).length,0);
});
