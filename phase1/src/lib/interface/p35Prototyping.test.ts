import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {INTERFACE_DEVICE_PRESETS,interfaceDevicePreset,interfaceDeviceFitScale,exportInterfacePreviewHTML} from './prototype';
import {TRANSITION_PRESETS,applyLinkTransitionPreset} from './transitionPresets';
function scene(){const s=createInterfaceSession();s.start();let a='',b='',button='';s.transact(d=>{a=addNode(d,d.pages[0].id,'frame');b=addNode(d,d.pages[0].id,'frame');button=addNode(d,d.pages[0].id,'rectangle',a);d.nodes.find(n=>n.id===button)!.prototypeLinks=[{trigger:'click',targetFrameId:b}];d.prototypeStartFrameId=a;});return {s,a,b,button};}
test('device presets are unique, positive and ordered phone < tablet < desktop screens',()=>{assert.equal(new Set(INTERFACE_DEVICE_PRESETS.map(p=>p.id)).size,INTERFACE_DEVICE_PRESETS.length);for(const p of INTERFACE_DEVICE_PRESETS){assert.ok(p.width>0&&p.height>0&&p.bezel>0&&p.radius>0);assert.ok(p.width<p.height||p.id==='desktop');}
 assert.equal(interfaceDevicePreset('phone')!.width,393);assert.equal(interfaceDevicePreset('watch'),undefined);});
test('device fit scale never upscales and shrinks oversized frames',()=>{const phone=interfaceDevicePreset('phone')!;assert.equal(interfaceDeviceFitScale(phone,393,852),1);assert.equal(interfaceDeviceFitScale(phone,100,100),1);assert.ok(Math.abs(interfaceDeviceFitScale(phone,786,852)-0.5)<1e-9);assert.equal(interfaceDeviceFitScale(phone,0,10),1);});
test('push and smart-animate presets apply as one edit with one undo each',()=>{const {s,button}=scene();for(const preset of ['push','smart-animate'] as const){s.transact(d=>applyLinkTransitionPreset(d,button,'click',preset));const link=s.get().document!.nodes.find(n=>n.id===button)!.prototypeLinks![0];assert.equal(link.transition!.kind,preset);assert.equal(link.transition!.durationMs,300);s.undo();assert.equal(s.get().document!.nodes.find(n=>n.id===button)!.prototypeLinks![0].transition,undefined);}
 s.transact(d=>applyLinkTransitionPreset(d,button,'click','slide'));assert.equal(s.get().document!.nodes.find(n=>n.id===button)!.prototypeLinks![0].transition!.kind,'slide');s.transact(d=>applyLinkTransitionPreset(d,button,'click','instant'));assert.equal(s.get().document!.nodes.find(n=>n.id===button)!.prototypeLinks![0].transition,undefined);
 assert.equal(TRANSITION_PRESETS['smart-animate']!.easing,'ease-in-out');});
test('preview HTML export embeds the device chrome only when a device is chosen',()=>{const {s}=scene();const plain=exportInterfacePreviewHTML(s.get().document!);assert.ok(!plain.html.includes('"device"'));
 const withDevice=exportInterfacePreviewHTML(s.get().document!,{deviceId:'phone'});assert.ok(withDevice.html.includes('"device":{"id":"phone","width":393,"height":852'));assert.ok(withDevice.html.includes('.device{'));assert.ok(withDevice.html.includes('deviceWrap'));
 assert.ok(!/src\s*=\s*"https?:/i.test(withDevice.html));assert.ok(!withDevice.html.includes('fetch('));assert.ok(!withDevice.html.includes('<script src'));
 assert.throws(()=>exportInterfacePreviewHTML(s.get().document!,{deviceId:'watch'}),/Unknown preview device/);});
