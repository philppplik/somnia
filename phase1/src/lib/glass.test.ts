import test from 'node:test';import assert from 'node:assert/strict';
import {resolveGlass,codeContrast,CODE_HARD_MIN} from './glass';
import {DEFAULT_LOOK,sanitizeLook,applyLook,rememberLook,readLook} from './look';
const base={opacity:68,blur:24,frame:true,panels:true,code:false};
test('default keeps today\'s 68 / 88 look and 24px blur',()=>{const g=resolveGlass(base);assert.equal(g.frameAlpha,0.68);assert.equal(g.panelAlpha,0.88);assert.equal(g.codeAlpha,1);assert.equal(g.blur,24);});
test('panels are +20pp capped at 100; opacity 0 allowed for frame and panels',()=>{assert.equal(resolveGlass({...base,opacity:90}).panelAlpha,1);const z=resolveGlass({...base,opacity:0});assert.equal(z.frameAlpha,0);assert.equal(z.panelAlpha,0.2);});
test('scope off means alpha 1; all scopes off means blur 0',()=>{const g=resolveGlass({...base,frame:false});assert.equal(g.frameAlpha,1);assert.equal(g.panelAlpha,0.88);assert.equal(resolveGlass({...base,frame:false,panels:false}).blur,0);});
test('reduced transparency and unsupported blur',()=>{const r=resolveGlass(base,{reducedTransparency:true});assert.deepEqual([r.frameAlpha,r.panelAlpha,r.codeAlpha,r.blur,r.reduced],[1,1,1,0,true]);assert.equal(resolveGlass(base,{blurSupported:false}).blur,0);assert.equal(resolveGlass(base,{blurSupported:false}).frameAlpha,0.68);});
test('low contrast warning below 60 % only with code scope',()=>{assert.equal(resolveGlass({...base,opacity:59,code:true}).lowContrast,true);assert.equal(resolveGlass({...base,opacity:59}).lowContrast,false);assert.equal(resolveGlass({...base,opacity:60,code:true}).lowContrast,false);});
test('hard floor: below 55 % only when contrast < 4.5 against the grey reference',()=>{
 const weak={textColor:'#aaaaaa',panelColor:'#ffffff'};const strong={textColor:'#000000',panelColor:'#000000'};
 const a=resolveGlass({...base,opacity:45,code:true},weak);assert.equal(a.floored,true);assert.equal(a.codeOpacity,CODE_HARD_MIN);assert.equal(a.codeAlpha,0.55);
 const b=resolveGlass({...base,opacity:45,code:true},{textColor:'#000000',panelColor:'#ffffff'});assert.equal(b.floored,false);assert.equal(b.codeAlpha,0.45);
 void strong;
 assert.equal(resolveGlass({...base,opacity:45,code:true}).floored,false,'unmeasurable colours only warn');assert.equal(resolveGlass({...base,opacity:45,code:true},{textColor:'#aaa',panelColor:'#fff'}).floored,true,'3-digit hex works');
 assert.equal(resolveGlass({...base,opacity:45}).floored,false,'frame/panels never floored');
 assert.equal(resolveGlass({...base,opacity:0}).frameAlpha,0);});
test('codeContrast maths',()=>{assert.ok(codeContrast(100,'#000000','#ffffff')! >20.9);assert.equal(codeContrast(100,'rgb(0,0,0)','#fff'),null);});
test('migration: old look (blur only) gets defaults, blur kept 1:1, idempotent',()=>{
 const old={background:'glass',glassBlur:12,glassPanels:false,accent:'#ABCDEF'};const m=sanitizeLook(old);
 assert.equal(m.glassBlur,12);assert.equal(m.glassOpacity,68);assert.equal(m.glassFrame,true);assert.equal(m.glassPanels,false);assert.equal(m.glassCode,false);
 assert.deepEqual(sanitizeLook(m),m);assert.equal(sanitizeLook({}).glassOpacity,DEFAULT_LOOK.glassOpacity);
 assert.equal(sanitizeLook({glassOpacity:150}).glassOpacity,100);assert.equal(sanitizeLook({glassOpacity:-3}).glassOpacity,0);assert.equal(sanitizeLook({glassOpacity:NaN}).glassOpacity,68);});
test('applyLook writes the four CSS variables and scope flags',()=>{
 const v=new Map<string,string>();const root={style:{setProperty:(k:string,x:string)=>v.set(k,x),removeProperty:(k:string)=>v.delete(k)},dataset:{} as Record<string,string>,ownerDocument:null} as any;
 applyLook({...DEFAULT_LOOK,glassOpacity:50,glassBlur:9,glassCode:true},root,{});
 assert.equal(v.get('--glass-frame-alpha'),'0.5');assert.equal(v.get('--glass-panel-alpha'),'0.7');assert.equal(v.get('--glass-code-alpha'),'0.5');assert.equal(v.get('--glass-blur'),'9px');assert.equal(root.dataset.glassCode,'true');
 applyLook({...DEFAULT_LOOK,glassFrame:false},root,{});assert.equal(v.get('--glass-frame-alpha'),'1');assert.equal(v.get('--glass-code-alpha'),'1');
 applyLook(DEFAULT_LOOK,root,{});assert.equal(v.get('--glass-frame-alpha'),'0.68');assert.equal(v.get('--glass-panel-alpha'),'0.88');assert.equal(v.get('--glass-blur'),'24px');});
test('storage keeps v2 wrapper so older builds still read it',()=>{
 const s=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>s.get(k)??null,setItem:(k:string,x:string)=>void s.set(k,x),removeItem:(k:string)=>void s.delete(k)};
 rememberLook({...DEFAULT_LOOK,glassOpacity:40,glassCode:true});const raw=JSON.parse(s.get('somnia.look.v2')!);assert.equal(raw.version,2);assert.equal(raw.glassSchema,2);assert.equal(readLook().glassOpacity,40);});
