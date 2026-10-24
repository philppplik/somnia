import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {interfaceMarqueeSelect,interfaceMarqueeStyle} from './editing';
import {t,setLocale} from '../i18n';
function scene(){const s=createInterfaceSession();s.start();let a='',b='',c='';s.transact(d=>{a=addNode(d,d.pages[0].id,'frame');b=addNode(d,d.pages[0].id,'frame');c=addNode(d,d.pages[0].id,'rectangle');const na=d.nodes.find(n=>n.id===a)!;na.x=0;na.y=0;na.width=100;na.height=100;const nb=d.nodes.find(n=>n.id===b)!;nb.x=200;nb.y=0;nb.width=100;nb.height=100;const nc=d.nodes.find(n=>n.id===c)!;nc.x=0;nc.y=200;nc.width=50;nc.height=50;});return {s,a,b,c};}
test('marquee returns intersecting top-level layers in page order and normalizes the rect',()=>{const {s,a,b,c}=scene();const d=s.get().document!;
 assert.deepEqual(interfaceMarqueeSelect(d,d.pages[0].id,{x:-10,y:-10,width:60,height:60}),[a]);
 assert.deepEqual(interfaceMarqueeSelect(d,d.pages[0].id,{x:260,y:60,width:-40,height:-40}),[b]);
 assert.deepEqual(interfaceMarqueeSelect(d,d.pages[0].id,{x:40,y:40,width:220,height:220}),[a,b,c]);
 assert.deepEqual(interfaceMarqueeSelect(d,d.pages[0].id,{x:500,y:500,width:10,height:10}),[]);s.clear();});
test('marquee skips hidden and locked layers and rejects unknown pages',()=>{const {s,a,b,c}=scene();const d=s.get().document!;
 s.transact(doc=>{doc.nodes.find(n=>n.id===a)!.hidden=true;doc.nodes.find(n=>n.id===b)!.locked=true;});
 assert.deepEqual(interfaceMarqueeSelect(s.get().document!,s.get().document!.pages[0].id,{x:-10,y:-10,width:400,height:400}),[c]);
 assert.throws(()=>interfaceMarqueeSelect(d,'nope',{x:0,y:0,width:10,height:10}),/Page unavailable/);s.clear();});
test('marquee overlay style normalizes drag direction',()=>{const st=interfaceMarqueeStyle({x0:50,y0:60,x1:10,y1:20});assert.equal(st.left,10);assert.equal(st.top,20);assert.equal(st.width,40);assert.equal(st.height,40);});
test('marquee label is localized in all five locales',()=>{for(const locale of ['en','de','es','fr','pt-BR']){setLocale(locale);assert.ok(t('interface.marquee').length>2,locale);}setLocale('en');});
