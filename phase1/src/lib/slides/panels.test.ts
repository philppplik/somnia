import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandDispatcher} from '../commandDispatcher';
import {slidesPanelCommandSpecs,type PanelCommandDeps} from './panelCommands';
import {slidesPanels,slidesInspector} from './panelDefinitions';
import {SLIDES_PANEL_CATALOGUES} from './panelI18n';
import {deckMetrics,selectedRun,slideOutline,textIssue} from './panelModel';
const runs=[{slide:0,run:0,text:'Hello world',part:'ppt/slides/slide1.xml'},{slide:1,run:0,text:'Second slide',part:'ppt/slides/slide2.xml'}];
function fixture(){
 const state={source:'blob:deck1',index:0,busy:false,working:new Uint8Array(40),runs:runs.map(r=>({...r})),slideIds:[256,257],summary:{slides:2}};
 const calls:unknown[]=[];const deps:PanelCommandDeps={state:()=>state,thumbnails:async()=>{calls.push('thumbnails');},show:async index=>{state.index=index;calls.push(['show',index]);},edit:async(run,text)=>{state.runs=state.runs.map(r=>r.slide===run.slide&&r.run===run.run?{...r,text}:r);calls.push(['edit',text]);},select:v=>calls.push(v),move:async(id,to)=>{const a=state.slideIds.slice();a.splice(to,0,a.splice(a.indexOf(id),1)[0]);state.slideIds=a;calls.push(['move',id,to]);}};
 const dispatcher=new CommandDispatcher();slidesPanelCommandSpecs(deps).forEach(s=>dispatcher.register(s));return {state,calls,dispatcher};
}
test('outline searches text and slide number and preserves empty slides',()=>{
 assert.equal(slideOutline(runs,3).length,3);assert.equal(slideOutline(runs,3,'WORLD')[0].index,0);assert.equal(slideOutline(runs,3,'2')[0].index,1);assert.equal(slideOutline(runs,3,'missing').length,0);
});
test('selection cannot cross deck or slide identities',()=>{
 const s={source:'deck',index:0,runs};assert.equal(selectedRun(s,{source:'deck',slide:0,run:0})?.text,'Hello world');assert.equal(selectedRun(s,{source:'other',slide:0,run:0}),undefined);assert.equal(selectedRun(s,{source:'deck',slide:1,run:0}),undefined);
});
test('UTF-8 byte limit, surrogate pairs, and XML text restrictions',()=>{
 assert.equal(textIssue('a'.repeat(16384)),null);assert.equal(textIssue('é'.repeat(8193)),'size');assert.equal(textIssue('\u0000'),'characters');assert.equal(textIssue('\ud800'),'characters');assert.equal(textIssue('🔥\nText\t'),null);
});
test('metrics describe actual working bytes and text',()=>{
 assert.deepEqual(deckMetrics({summary:{slides:2,widthPt:100,heightPt:50},runs,working:new Uint8Array(40),wasmBytes:200}),{slides:2,runs:2,words:4,bytes:40,wasmBytes:200});
});
test('text selection navigates before selecting with stable source',async()=>{
 const f=fixture();await f.dispatcher.runCommand('slides.selectText',{source:'blob:deck1',slide:1,run:0,old:'Second slide'},{origin:'ui'});assert.equal(f.state.index,1);assert.deepEqual(f.calls[0],['show',1]);assert.deepEqual(f.calls[1],{source:'blob:deck1',slide:1,run:0});
});
test('edits validate schema, byte count, identity, old text and origins before mutation',async()=>{
 const f=fixture();const valid={source:'blob:deck1',slide:0,run:0,old:'Hello world',text:'Edited'};
 for(const p of [{...valid,source:'wrong'},{...valid,old:'stale'},{...valid,slide:1},{...valid,text:'é'.repeat(8193)},{...valid,text:'\u0000'},{...valid,run:-1},{...valid,extra:true}])await assert.rejects(f.dispatcher.runCommand('slides.editText',p,{origin:'ui'}));
 for(const origin of ['agent','mcp'] as const)await assert.rejects(f.dispatcher.runCommand('slides.editText',valid,{origin}));assert.equal(f.calls.length,0);
 await f.dispatcher.runCommand('slides.editText',valid,{origin:'ui'});assert.equal(f.state.runs[0].text,'Edited');assert.deepEqual(f.calls,[['edit','Edited']]);
});
test('busy and missing session disable every panel operation',async()=>{
 const f=fixture();f.state.busy=true;for(const spec of f.dispatcher.list())assert.equal(f.dispatcher.isEnabled(spec.id),false);f.state.busy=false;f.state.summary=null as never;for(const spec of f.dispatcher.list())assert.equal(f.dispatcher.isEnabled(spec.id),false);
});
test('thumbnail command uses session operation',async()=>{const f=fixture();await f.dispatcher.runCommand('slides.loadThumbnails',undefined,{origin:'ui'});assert.deepEqual(f.calls,['thumbnails']);});
test('every panel command and UI key exists in all five locales',()=>{
 const keys=Object.keys(SLIDES_PANEL_CATALOGUES.en).sort();for(const locale of ['en','de','es','fr','pt-BR'])assert.deepEqual(Object.keys(SLIDES_PANEL_CATALOGUES[locale]).sort(),keys);
 for(const p of slidesPanels){assert.equal(p.component,p.id==='inspector'?'shell.inspector':`slides.${p.id}`);assert.ok(SLIDES_PANEL_CATALOGUES.en[p.titleKey!]);}
 for(const id of ['loadThumbnails','selectText','editText','moveSlide','moveSlideEarlier','moveSlideLater'])for(const locale of Object.keys(SLIDES_PANEL_CATALOGUES))assert.ok(SLIDES_PANEL_CATALOGUES[locale][`cmd.slides.${id}`]);
});

test('inspector section titles and commands are declared',()=>{
 for(const section of slidesInspector.sections){assert.equal(section.component,`slides.inspector.${section.id}`);assert.ok(SLIDES_PANEL_CATALOGUES.en[section.titleKey!]);}
 assert.deepEqual(slidesInspector.sections.map(s=>s.id),['text','deck','diagnostics']);
});

test('moveSlide validates identity, ranges and origins before mutating',async()=>{
 const f=fixture();const ok={source:'blob:deck1',slideId:257,toIndex:0};
 for(const p of [{...ok,source:'x'},{...ok,slideId:999},{...ok,toIndex:2},{...ok,toIndex:-1},{...ok,toIndex:0.5},{...ok,slideId:'257'},{...ok,extra:1},{source:'blob:deck1'}])await assert.rejects(f.dispatcher.runCommand('slides.moveSlide',p,{origin:'ui'}));
 for(const origin of ['agent','mcp'] as const)await assert.rejects(f.dispatcher.runCommand('slides.moveSlide',ok,{origin}));
 assert.equal(f.calls.length,0);
 await f.dispatcher.runCommand('slides.moveSlide',ok,{origin:'ui'});assert.deepEqual(f.calls,[['move',257,0]]);assert.deepEqual(f.state.slideIds,[257,256]);
});
test('earlier/later follow the viewed slide and stop at the edges',async()=>{
 const f=fixture();assert.equal(f.dispatcher.isEnabled('slides.moveSlideEarlier'),false);assert.equal(f.dispatcher.isEnabled('slides.moveSlideLater'),true);
 await f.dispatcher.runCommand('slides.moveSlideLater',undefined,{origin:'ui'});assert.deepEqual(f.calls,[['move',256,1]]);
 await assert.rejects(f.dispatcher.runCommand('slides.moveSlideEarlier',undefined,{origin:'ui'}));
 f.state.index=1;assert.equal(f.dispatcher.isEnabled('slides.moveSlideLater'),false);assert.equal(f.dispatcher.isEnabled('slides.moveSlideEarlier'),true);
});
test('reorder is disabled for non-canonical decks, single slides and busy sessions',()=>{
 const f=fixture();f.state.slideIds=[];assert.equal(f.dispatcher.isEnabled('slides.moveSlide'),false);
 f.state.slideIds=[256];f.state.summary={slides:1};assert.equal(f.dispatcher.isEnabled('slides.moveSlide'),false);
 f.state.slideIds=[256,257];f.state.summary={slides:2};f.state.busy=true;assert.equal(f.dispatcher.isEnabled('slides.moveSlide'),false);
});
