import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createImage } from '../../lib/image/buffer';
import { rectSelection } from '../../lib/imgedit/select';
import { SelectionEditor } from './SelectionEditor';
import { SelectionOverlay } from './SelectionOverlay';
const selection=rectSelection(4,3,{x:1,y:0},{x:3,y:2});
const base={image:null,raster:createImage(4,3),selection,onSelectionChange(){},onCommit(){}};
test('selection editor renders real tools and enabled copy/cut/fill',()=>{
  const html=renderToStaticMarkup(<SelectionEditor {...base}/>);
  for(const text of ['Rectangle','Freehand lasso','Magic wand','Copy','Cut','Fill','Selection fill alpha'])assert.ok(html.includes(text));
  assert.match(html,/>Copy<\/button>/);assert.ok(!html.includes('disabled=""'));
});
test('empty or stale selection disables actions',()=>{
  for(const selection of [null,rectSelection(2,2,{x:0,y:0},{x:2,y:2})]){
    const html=renderToStaticMarkup(<SelectionEditor {...base} selection={selection}/>);
    assert.match(html,/<button[^>]*disabled=""[^>]*>Copy/);assert.match(html,/<button[^>]*disabled=""[^>]*>Fill/);
  }
});
test('marching ants overlay tracks image transform with constant-width strokes and reduced motion',()=>{
  const html=renderToStaticMarkup(<SelectionOverlay selection={selection} viewport={{x:10,y:20,zoom:2}}/>);
  assert.ok(html.includes('translate(10 20) scale(2)'));assert.ok(html.includes('non-scaling-stroke'));assert.ok(html.includes('prefers-reduced-motion'));
  assert.equal(renderToStaticMarkup(<SelectionOverlay selection={null} viewport={{x:0,y:0,zoom:1}}/>),'');
});
