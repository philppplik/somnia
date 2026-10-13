import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArrangeSection,ArtboardSection,ArtboardsPanel,ColorsPanel,LayersPanel,ProjectSection,SelectionSection} from './DesignShellPanels';
import {clearDesign,editDesign,selectDesignNode,selectDesignNodes,startDesign} from '../../lib/design/session';
import {addDesignNode} from '../../lib/design/panelAdapter';
import {addBoard} from '../../lib/design/artboardActions';
import {CATALOGUES} from '../../lib/i18n';
import {ARTBOARD_PRESETS} from '../../lib/design/artboards';
const panel={panelId:'x',context:{studio:'design',selection:{kind:'none' as const,count:0},busy:false,services:{ready:true}}};
const section={sectionId:'x',context:panel.context};
const html=(el:React.ReactElement)=>renderToStaticMarkup(el);
/** The opening tag that carries a data-testid, so `disabled=""` is not confused with Tailwind's disabled: classes. */
const tag=(h:string,id:string)=>h.match(new RegExp(`<[a-z]+[^>]*data-testid="${id}"[^>]*>`))?.[0]??'';
const isDisabled=(h:string,id:string)=>{const t=tag(h,id);assert.ok(t,id);return /\sdisabled=""/.test(t);};
test('panels render honest empty states without a design',()=>{
 clearDesign();
 assert.match(html(<ArtboardsPanel {...panel}/>),/design-boards-empty/);
 assert.match(html(<ColorsPanel {...panel}/>),/No colours on this artboard yet/);
 assert.match(html(<LayersPanel {...panel}/>),/design-layers-empty/);
 assert.equal(html(<ArtboardSection {...section}/>),'');assert.equal(html(<ProjectSection {...section}/>),'');
});
test('artboards panel lists boards with size, count and the active one selected',()=>{
 clearDesign();startDesign();addDesignNode('rectangle');addBoard({width:1080,height:1920,name:'Story'});
 const h=html(<ArtboardsPanel {...panel}/>);
 assert.equal((h.match(/data-testid="design-board-row"/g)??[]).length,2);
 assert.match(h,/aria-selected="true"[^>]*data-testid="design-board-row"[^>]*>.*Story/s);
 assert.match(h,/960x640/);assert.match(h,/1080x1920/);assert.match(h,/Artboard 2 of 2/);
 for(const p of ARTBOARD_PRESETS)assert.match(h,new RegExp(`>${p.label}[^<]*\\(${p.width}x${p.height}\\)`));
 assert.match(h,/data-testid="design-board-delete"/);assert.equal(isDisabled(h,'design-board-delete'),false);
});
test('delete is disabled with a single artboard',()=>{clearDesign();startDesign();assert.equal(isDisabled(html(<ArtboardsPanel {...panel}/>),'design-board-delete'),true);});
test('colours panel shows the used palette; swatches are disabled without a selection',()=>{
 clearDesign();startDesign();const id=addDesignNode('rectangle')!;selectDesignNode(null);
 let h=html(<ColorsPanel {...panel}/>);
 assert.match(h,/data-color="#ffffff"/);assert.match(h,/data-color="#7756e8"/);assert.match(h,/design-colors-hint/);assert.equal(isDisabled(h,'design-swatch'),true);
 selectDesignNode(id);h=html(<ColorsPanel {...panel}/>);assert.doesNotMatch(h,/design-colors-hint/);assert.equal(isDisabled(h,'design-swatch'),false);
});
test('selection, arrange, artboard and project sections render their controls',()=>{
 clearDesign();startDesign();const a=addDesignNode('rectangle')!,b=addDesignNode('text')!;selectDesignNodes([a,b]);
 assert.match(html(<SelectionSection {...section}/>),/design-align-left/);
 const arr=html(<ArrangeSection {...section}/>);for(const k of ['front','forward','backward','back'])assert.match(arr,new RegExp(`design-stack-${k}`));
 for(const d of ['left','right','up','down'])assert.match(arr,new RegExp(`design-nudge-${d}`));
 const ab=html(<ArtboardSection {...section}/>);assert.match(ab,/aria-label="Active artboard"/);assert.match(ab,/value="960"/);assert.match(ab,/value="640"/);assert.match(ab,/design-board-background/);
 const pr=html(<ProjectSection {...section}/>);assert.match(pr,/Untitled design/);assert.match(pr,/1 artboards, 2 layers \(0 hidden, 0 locked\)/);
});
test('arrange buttons are disabled when every selected layer is locked',()=>{
 clearDesign();startDesign();const a=addDesignNode('rectangle')!;editDesign(d=>({...d,artboards:d.artboards.map(x=>({...x,nodes:x.nodes.map(n=>({...n,locked:true}))}))}));selectDesignNode(a);
 assert.equal(isDisabled(html(<ArrangeSection {...section}/>),'design-stack-front'),true);
});
test('every i18n key the shell panels use exists in all five locales',()=>{
 const src=readFileSync(new URL('./DesignShellPanels.tsx',import.meta.url),'utf8');
 const keys=new Set<string>([...src.matchAll(/t\('(design\.[A-Za-z.]+)'/g)].map(m=>m[1]));
 for(const k of ['front','forward','backward','back'])keys.add(`design.arrange.${k}`);
 for(const k of ['left','right','up','down'])keys.add(`design.arrange.nudge.${k}`);
 for(const k of ['fill','stroke','background'])keys.add(`design.colors.${k}`);
 for(const k of ['empty','nan','range'])keys.add(`design.inspector.invalid.${k}`);
 for(const p of ARTBOARD_PRESETS)keys.add(`design.preset.${p.id}`);
 for(const k of ['design.preset'])keys.delete(k);
 assert.ok(keys.size>40);
 for(const [l,c] of Object.entries(CATALOGUES))assert.deepEqual([...keys].filter(k=>!(k in c)),[],l);
});
test('translations keep their placeholders in every locale',()=>{
 for(const k of ['design.artboards.position','design.colors.applyTo','design.project.stats']){
  const ph=(CATALOGUES.en[k].match(/\{\w+\}/g)??[]).sort();
  for(const [l,c] of Object.entries(CATALOGUES))assert.deepEqual((c[k].match(/\{\w+\}/g)??[]).sort(),ph,`${k} ${l}`);
 }
});
