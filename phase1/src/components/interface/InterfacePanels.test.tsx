import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {InterfaceLayers,InterfaceProperties} from './InterfacePanels';
import {InterfaceCanvas} from './InterfaceCanvas';
import {interfaceSession} from '../../lib/interface/session';
import {addNode} from '../../lib/interface/model';
import {setLocale} from '../../lib/i18n';
test('separate ordinary panels render tree and properties without a second inspector host',()=>{
 interfaceSession.start();interfaceSession.transact(d=>{d.name='<script>document</script>';const frame=addNode(d,d.pages[0].id,'frame');const text=addNode(d,d.pages[0].id,'text',frame);d.nodes[1].name='<img src=x>';d.nodes[1].text='<script>alert(1)</script>';interfaceSession.select(text);});
 interfaceSession.select(interfaceSession.get().document!.nodes[1].id);
 const left=renderToStaticMarkup(<InterfaceLayers/>),right=renderToStaticMarkup(<InterfaceProperties/>),canvas=renderToStaticMarkup(<InterfaceCanvas/>);
 assert.ok(left.includes('aria-label="Pages and layers"'));assert.ok(left.includes('&lt;img src=x&gt;'));assert.ok(right.includes('&lt;script&gt;document'));assert.ok(canvas.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!canvas.includes('<script>'));assert.ok(canvas.includes('interface-canvas'));
 interfaceSession.clear();
});
test('German empty state has local labels and no enabled export promise',()=>{interfaceSession.clear();setLocale('de');try{const html=renderToStaticMarkup(<InterfaceCanvas/>);assert.ok(html.includes('Leeres Dokument erstellen'));assert.ok(html.includes('Snapshot öffnen'));assert.ok(!html.includes('Present'));}finally{setLocale('en');}});
test('P1 layout/component controls render without exposing edits to instance structure',async()=>{
 const {createComponent,instantiateComponent}=await import('../../lib/interface/components');const {DEFAULT_LAYOUT}=await import('../../lib/interface/schema');interfaceSession.start();let root='',instance='';interfaceSession.transact(d=>{root=addNode(d,d.pages[0].id,'frame');d.nodes[0].layout={...DEFAULT_LAYOUT,direction:'row',wrap:true};const c=createComponent(d,root,'Card');instance=instantiateComponent(d,c,d.components![0].variants[0].id,d.pages[0].id);});interfaceSession.select(root);const master=renderToStaticMarkup(<InterfaceProperties/>);assert.ok(master.includes('Padding top'));assert.ok(master.includes('Create instance'));assert.ok(master.includes('Add variant'));interfaceSession.select(instance);const html=renderToStaticMarkup(<InterfaceProperties/>);assert.ok(html.includes('Reset overrides'));assert.ok(html.includes('Detach instance'));assert.ok(html.includes('disabled'));interfaceSession.clear();
});
