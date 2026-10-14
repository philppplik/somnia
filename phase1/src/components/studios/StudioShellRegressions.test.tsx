import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {patchState} from '../../store/appStore';
import {patchUi} from '../../lib/svgedit/store';
import {CodeDesignSection} from './code/CodePanels';
import {SvgInspector} from '../svgedit/SvgInspector';
import {view} from '../../lib/svgedit/controller';
import {VectorPageSection} from '../vectorstudio/VectorPanels';
import {createBlankVector,resetVectorSession} from '../../lib/vectorstudio/session';
import type {StudioContext} from '../../lib/shell/types';
const context:StudioContext={studio:'code',selection:{kind:'none',count:0},busy:false,services:{}};
const svgState={activeFile:'shell-test.svg',designFile:'shell-test.svg',files:{'shell-test.svg':'<svg width="100" height="100"><rect width="20" height="20"/></svg>'},coreConnected:true,viewMode:'design' as const};
test('Code design section embeds the real SVG document and snap controls without nested panel chrome',()=>{
 patchState(svgState);patchUi({selection:[],inspectorTab:'design'});
 const html=renderToStaticMarkup(<CodeDesignSection context={context}/>);
 for(const id of ['svg-inspector','svg-doc-width','svg-snap-panel','svg-grid-size','svg-guide-add-v'])assert.ok(html.includes(`data-testid="${id}"`),id);
 assert.ok(!html.includes('<aside'),'the shared shell owns the panel');
 assert.ok(!html.includes('panel inspector'),'no duplicate inspector chrome');
});
test('SVG inspector retains standalone compatibility and color/source tabs inside the shell',()=>{
 patchState(svgState);patchUi({selection:[],inspectorTab:'color'});
 let html=renderToStaticMarkup(<CodeDesignSection context={context}/>);
 assert.ok(html.includes('svg-draw-fill')&&html.includes('svg-draw-stroke'));
 html=renderToStaticMarkup(<SvgInspector/>);assert.match(html,/<aside class="panel inspector svg-inspector"/);
 patchUi({inspectorTab:'code'});html=renderToStaticMarkup(<CodeDesignSection context={context}/>);assert.ok(html.includes('data-testid="svg-inspector"'));
});
test('selected SVG exposes fill/stroke gradients and clip release in the embedded section',()=>{
 patchState({...svgState,files:{'shell-test.svg':'<svg><defs><clipPath id="clip"><rect width="5" height="5"/></clipPath></defs><rect width="20" height="20" fill="#123456" stroke="#654321" clip-path="url(#clip)"/></svg>'}});
 patchUi({selection:['1'],inspectorTab:'design'});
 view.svg={getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),querySelector:()=>({getBoundingClientRect:()=>({left:0,top:0,right:20,bottom:20})})} as unknown as SVGSVGElement;
 try{
  const html=renderToStaticMarkup(<CodeDesignSection context={context}/>);
  for(const id of ['svg-fill','svg-stroke','svg-clip-release'])assert.ok(html.includes(`data-testid="${id}"`),id);
  assert.ok(html.includes('data-grad-prop="fill"')&&html.includes('data-grad-prop="stroke"'));
 }finally{view.svg=null;patchUi({selection:[]});}
});
test('Code-only mode does not show editable SVG design controls',()=>{
 patchState({...svgState,viewMode:'code'});
 assert.ok(!renderToStaticMarkup(<CodeDesignSection context={context}/>).includes('data-testid="svg-inspector"'));
});
test('Vector page section makes strict replacement reachable without opening the Export panel',()=>{
 resetVectorSession();createBlankVector();
 const html=renderToStaticMarkup(<VectorPageSection/>);
 assert.ok(html.includes('data-testid="vector-import-svg"')&&html.includes('data-testid="vector-svg-file"'));
 assert.ok(html.includes('Undo restores the previous drawing.'));
 resetVectorSession();
});
test.after(()=>{patchState({activeFile:'',designFile:'',files:{},coreConnected:false,viewMode:'design'});patchUi({selection:[],inspectorTab:'design'});});
