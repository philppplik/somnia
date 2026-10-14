import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlidesOverviewPanel,SlidesOutlinePanel,SlidesTextPanel,SlidesDeckPanel,SlidesDiagnosticsPanel} from './shellPanels';
import {EMPTY_STUDIO_CONTEXT} from '../../lib/shell/types';
import {slidesPanels,slidesInspector} from '../../lib/slides/panelDefinitions';
import {validateStudioShell} from '../../lib/shell/panels';
import {slidesCommandSpecs} from '../../lib/slides/commands';
import {slidesPanelCommandSpecs} from '../../lib/slides/panelCommands';
test('all panel hosts render an honest empty state without a deck',()=>{
 for(const Component of [SlidesOverviewPanel,SlidesOutlinePanel,SlidesTextPanel,SlidesDeckPanel,SlidesDiagnosticsPanel]){
  const html=renderToStaticMarkup(<Component sectionId="test" context={{...EMPTY_STUDIO_CONTEXT,studio:'slides'}}/>);assert.match(html,/Open a PPTX/);assert.doesNotMatch(html,/coming soon/i);
 }
});
test('panel manifest validates every declared command and host',()=>{
 const commands=new Set([...slidesCommandSpecs({state:()=>({busy:false,working:false,canUndo:false,canRedo:false,slides:0,index:0,presenting:false}),present:()=>{},exitPresent:()=>{},history:()=>{},saveCopy:()=>{},showSlide:()=>{}}),...slidesPanelCommandSpecs({state:()=>({source:'',index:0,busy:false,working:null,runs:[],slideIds:[],layouts:[],model:null,summary:null}),thumbnails:async()=>{},edit:async()=>{},show:async()=>{},select:()=>{},move:async()=>{},duplicate:async()=>{},remove:async()=>{},add:async()=>{},setBounds:async()=>{},format:async()=>{},addBox:async()=>{},removeBox:async()=>{},pick:()=>{},picked:()=>null})].map(s=>s.id));
 assert.deepEqual(validateStudioShell('slides',{panels:slidesPanels,inspector:slidesInspector},{commandExists:id=>commands.has(id),hostExists:id=>slidesPanels.some(p=>p.component===id)||slidesInspector.sections.some(s=>s.component===id)}),[]);
});
