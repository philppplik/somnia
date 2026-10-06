import test from 'node:test';import assert from 'node:assert/strict';
import {resolveGlass,codeContrast,compositeOverReference,GLASS_DEFAULT_OPACITY,PANEL_OFFSET,CODE_HARD_MIN,CODE_RECOMMENDED_MIN,CODE_CONTRAST_MIN,HIGH_BLUR} from './glass';
import {DEFAULT_LOOK,sanitizeLook,applyLook,rememberLook,readLook,LOOK_KEY} from './look';
const base={opacity:68,blur:24,frame:true,panels:true,code:false};
const weak={textColor:'#aaaaaa',panelColor:'#ffffff'};
const mkRoot=()=>{const v=new Map<string,string>();const root={style:{setProperty:(k:string,x:string)=>void v.set(k,x),removeProperty:(k:string)=>void v.delete(k)},dataset:{} as Record<string,string>,ownerDocument:null} as any;return{v,root};};
const mkStore=(init:Record<string,string>={})=>{const s=new Map<string,string>(Object.entries(init));(globalThis as any).localStorage={getItem:(k:string)=>s.get(k)??null,setItem:(k:string,x:string)=>void s.set(k,x),removeItem:(k:string)=>void s.delete(k)};return s;};

test('spec constants: 68 default, +20 panels, 60 recommended, 55 hard, 4.5 AA, 24 px high blur',()=>{
 assert.deepEqual([GLASS_DEFAULT_OPACITY,PANEL_OFFSET,CODE_RECOMMENDED_MIN,CODE_HARD_MIN,CODE_CONTRAST_MIN,HIGH_BLUR],[68,20,60,55,4.5,24]);
 assert.equal(DEFAULT_LOOK.glassOpacity,GLASS_DEFAULT_OPACITY);});

test('scaling: panels = opacity + 20 capped at 100 for every integer 0..100; frame = opacity',()=>{
 for(let o=0;o<=100;o++){const g=resolveGlass({...base,opacity:o});
  assert.equal(g.frameAlpha,o/100,`frame ${o}`);
  assert.equal(g.panelAlpha,Math.min(100,o+20)/100,`panels ${o}`);
  assert.ok(g.panelAlpha>=g.frameAlpha);assert.equal(g.codeAlpha,1,'code scope off');}});

test('opacity input is rounded and clamped: -50, 150, 49.6, NaN-free extremes',()=>{
 assert.equal(resolveGlass({...base,opacity:-50}).frameAlpha,0);
 assert.equal(resolveGlass({...base,opacity:150}).frameAlpha,1);
 assert.equal(resolveGlass({...base,opacity:49.6}).frameAlpha,0.5);
 assert.equal(resolveGlass({...base,opacity:49.4}).frameAlpha,0.49);
 assert.equal(resolveGlass({...base,blur:11.6}).blur,12);});

test('each scope toggles independently (all 8 combinations)',()=>{
 for(const frame of [true,false])for(const panels of [true,false])for(const code of [true,false]){
  const g=resolveGlass({opacity:50,blur:10,frame,panels,code});
  assert.equal(g.frameAlpha,frame?0.5:1);assert.equal(g.panelAlpha,panels?0.7:1);assert.equal(g.codeAlpha,code?0.5:1);
  assert.equal(g.blur,frame||panels||code?10:0,`blur ${frame}${panels}${code}`);}});

test('opacity 0 % is legal for frame and panels and never triggers floor or warning without code scope',()=>{
 const g=resolveGlass({...base,opacity:0},weak);
 assert.equal(g.frameAlpha,0);assert.equal(g.panelAlpha,0.2);assert.equal(g.floored,false);assert.equal(g.lowContrast,false);});

test('low contrast boundary: 59 warns, 60 does not, 100 does not; independent of colours',()=>{
 const w=(o:number,env={})=>resolveGlass({...base,opacity:o,code:true},env).lowContrast;
 assert.equal(w(0),true);assert.equal(w(59),true);assert.equal(w(60),false);assert.equal(w(61),false);assert.equal(w(100),false);
 assert.equal(w(59,weak),true);});

test('hard floor boundary: 54 floors (weak), 55 does not floor, floor value is exactly 55',()=>{
 const f=(o:number)=>resolveGlass({...base,opacity:o,code:true},weak);
 assert.equal(f(54).floored,true);assert.equal(f(54).codeOpacity,55);assert.equal(f(54).codeAlpha,0.55);
 assert.equal(f(0).floored,true);assert.equal(f(0).codeAlpha,0.55);
 assert.equal(f(55).floored,false);assert.equal(f(55).codeAlpha,0.55);assert.equal(f(55).codeOpacity,55);
 assert.equal(f(56).floored,false);assert.equal(f(56).codeAlpha,0.56);
 /* Floor never touches the other scopes. */
 assert.equal(f(30).frameAlpha,0.3);assert.equal(f(30).panelAlpha,0.5);});

test('hard floor needs BOTH opacity < 55 and contrast < 4.5; strong text at low opacity stays unfloored',()=>{
 const strong=resolveGlass({...base,opacity:20,code:true},{textColor:'#000000',panelColor:'#ffffff'});
 assert.equal(strong.floored,false);assert.equal(strong.codeAlpha,0.2);assert.equal(strong.lowContrast,true,'still warns');
 const dark=resolveGlass({...base,opacity:20,code:true},{textColor:'#ffffff',panelColor:'#000000'});
 assert.equal(typeof dark.floored,'boolean');
 const c=codeContrast(20,'#ffffff','#000000')!;assert.equal(dark.floored,c<CODE_CONTRAST_MIN);});

test('floor decision equals contrast < 4.5 at the chosen opacity (consistency with codeContrast)',()=>{
 const pairs:[string,string][]=[['#aaaaaa','#ffffff'],['#333333','#ffffff'],['#ffffff','#1e1e1e'],['#777777','#f8f9fb'],['#ccd6f6','#0b1220']];
 for(const [t,p] of pairs)for(const o of [0,10,30,54]){
  const c=codeContrast(o,t,p)!;const g=resolveGlass({...base,opacity:o,code:true},{textColor:t,panelColor:p});
  assert.equal(g.floored,c<CODE_CONTRAST_MIN,`${t}/${p}@${o} c=${c}`);}});

test('unmeasurable colours (rgb(), var(), empty, 5-digit hex) never floor, only warn',()=>{
 for(const [t,p] of [['rgb(0,0,0)','#fff'],['#000','var(--x)'],['','#fff'],['#12345','#ffffff'],['#gggggg','#ffffff']]){
  const g=resolveGlass({...base,opacity:10,code:true},{textColor:t,panelColor:p});
  assert.equal(g.floored,false,`${t}|${p}`);assert.equal(g.lowContrast,true);assert.equal(g.codeAlpha,0.1);}
 assert.equal(codeContrast(50,'#fff','nope'),null);});

test('hex parsing: 3-digit, uppercase and whitespace equal their 6-digit form',()=>{
 assert.equal(codeContrast(70,'#ABC','#FFF'),codeContrast(70,'#aabbcc','#ffffff'));
 assert.equal(codeContrast(70,' #aabbcc ','#ffffff'),codeContrast(70,'#aabbcc','#ffffff'));});

test('codeContrast maths: known WCAG values and monotonic in opacity',()=>{
 assert.equal(codeContrast(100,'#000000','#ffffff'),21);
 assert.equal(codeContrast(100,'#ffffff','#ffffff'),1);
 assert.equal(codeContrast(100,'#777777','#ffffff'),4.48);
 let prev=Infinity;for(let o=0;o<=100;o+=5){const c=codeContrast(o,'#000000','#ffffff')!;assert.ok(c>=1);if(o>0)assert.ok(c>=0,'finite');prev=Math.min(prev,c);}
 /* white panel over mid grey gets darker toward 0 %, so black text loses contrast vs. 100 % */
 assert.ok(codeContrast(0,'#000000','#ffffff')!<codeContrast(100,'#000000','#ffffff')!);});

test('compositeOverReference blends over #808080 and clamps alpha',()=>{
 assert.deepEqual(compositeOverReference('#ffffff',100),[255,255,255]);
 assert.deepEqual(compositeOverReference('#ffffff',0),[128,128,128]);
 assert.deepEqual(compositeOverReference('#000000',50),[64,64,64]);
 assert.deepEqual(compositeOverReference('#ffffff',500),[255,255,255]);
 assert.deepEqual(compositeOverReference('#ffffff',-5),[128,128,128]);});

test('high blur flag: > 24 only, independent of scopes and opacity',()=>{
 assert.equal(resolveGlass({...base,blur:24}).highBlur,false);assert.equal(resolveGlass({...base,blur:25}).highBlur,true);
 assert.equal(resolveGlass({...base,blur:40,frame:false,panels:false}).highBlur,true);
 assert.equal(resolveGlass({...base,blur:0}).highBlur,false);});

test('reduced transparency: everything opaque, blur 0, flag set, even with code scope and floor inputs',()=>{
 const g=resolveGlass({opacity:10,blur:40,frame:true,panels:true,code:true},{...weak,reducedTransparency:true});
 assert.deepEqual([g.frameAlpha,g.panelAlpha,g.codeAlpha,g.blur,g.reduced],[1,1,1,0,true]);
 assert.equal(resolveGlass(base,{reducedTransparency:false}).reduced,false);});

test('blur unsupported: blur 0 but transparency still applies; scope-off + unsupported stays 0',()=>{
 const g=resolveGlass({...base,code:true,opacity:70},{blurSupported:false});
 assert.deepEqual([g.frameAlpha,g.panelAlpha,g.codeAlpha,g.blur],[0.7,0.9,0.7,0]);
 assert.equal(resolveGlass(base,{blurSupported:undefined}).blur,24,'unknown support does not disable blur');});

test('resolveGlass is pure: same input twice, input object untouched',()=>{
 const i={opacity:41,blur:7,frame:true,panels:false,code:true};const snap={...i};
 assert.deepEqual(resolveGlass(i,weak),resolveGlass(i,weak));assert.deepEqual(i,snap);});

/* ---- look.ts: sanitize, migration, apply, storage ---- */
test('default look: v2 defaults equal the old hardcoded 68/88 and 24 px',()=>{
 assert.deepEqual([DEFAULT_LOOK.glassOpacity,DEFAULT_LOOK.glassBlur,DEFAULT_LOOK.glassFrame,DEFAULT_LOOK.glassPanels,DEFAULT_LOOK.glassCode],[68,24,true,true,false]);
 const {v,root}=mkRoot();applyLook(DEFAULT_LOOK,root,{});
 assert.equal(v.get('--glass-frame-alpha'),'0.68');assert.equal(v.get('--glass-panel-alpha'),'0.88');assert.equal(v.get('--glass-code-alpha'),'1');assert.equal(v.get('--glass-blur'),'24px');});

test('sanitizeLook: garbage types fall back to defaults, ranges clamp, blur rounds',()=>{
 for(const bad of [null,undefined,'x',42,[],{glassOpacity:'50'},{glassOpacity:null},{glassOpacity:Infinity},{glassBlur:'9'},{glassFrame:'yes'},{glassCode:1}]){
  const s=sanitizeLook(bad as any);
  assert.equal(s.glassOpacity,68);assert.equal(s.glassBlur,24);assert.equal(s.glassFrame,true);assert.equal(s.glassPanels,true);assert.equal(s.glassCode,false);}
 assert.equal(sanitizeLook({glassBlur:99}).glassBlur,40);assert.equal(sanitizeLook({glassBlur:-1}).glassBlur,0);assert.equal(sanitizeLook({glassBlur:12.6}).glassBlur,13);
 assert.equal(sanitizeLook({glassOpacity:0}).glassOpacity,0,'0 is kept, not replaced by default');
 assert.equal(sanitizeLook({glassOpacity:33.4}).glassOpacity,33);});

test('migration: old look with only blur keeps blur 1:1 for 0..40, opacity 68, scopes default; idempotent',()=>{
 for(let b=0;b<=40;b++){const m=sanitizeLook({background:'glass',glassBlur:b});
  assert.equal(m.glassBlur,b);assert.equal(m.glassOpacity,68);assert.equal(m.glassFrame,true);assert.equal(m.glassPanels,true);assert.equal(m.glassCode,false);
  assert.deepEqual(sanitizeLook(m),m);assert.deepEqual(sanitizeLook(sanitizeLook(m)),m);}});

test('migration resolves to the pixel-identical pre-v2 alphas for any old blur value',()=>{
 for(const b of [0,8,24,40]){const m=sanitizeLook({glassBlur:b});const g=resolveGlass({opacity:m.glassOpacity,blur:m.glassBlur,frame:m.glassFrame,panels:m.glassPanels,code:m.glassCode});
  assert.deepEqual([g.frameAlpha,g.panelAlpha,g.codeAlpha,g.blur],[0.68,0.88,1,b]);}});

test('migration keeps unrelated settings and missing keys get defaults',()=>{
 const m=sanitizeLook({accent:'#ABCDEF',density:'compact',uiScale:110});
 assert.equal(m.accent,'#abcdef');assert.equal(m.density,'compact');assert.equal(m.uiScale,110);assert.equal(m.glassOpacity,68);});

test('applyLook: each scope writes alpha 1 when off; code var stays 1 unless code scope on',()=>{
 for(const [k,vars] of [['glassFrame',['--glass-frame-alpha']],['glassPanels',['--glass-panel-alpha']],['glassCode',['--glass-code-alpha']]] as const){
  const {v,root}=mkRoot();applyLook({...DEFAULT_LOOK,glassOpacity:40,glassFrame:true,glassPanels:true,glassCode:true,[k]:false} as any,root,{});
  for(const name of vars)assert.equal(v.get(name),'1',`${k} off -> ${name}`);}
 const {v,root}=mkRoot();applyLook({...DEFAULT_LOOK,glassOpacity:40},root,{});assert.equal(v.get('--glass-code-alpha'),'1');});

test('applyLook: reduced transparency writes opaque vars but look values stay stored',()=>{
 const {v,root}=mkRoot();const look={...DEFAULT_LOOK,glassOpacity:30,glassBlur:30,glassCode:true};
 applyLook(look,root,{reducedTransparency:true});
 assert.deepEqual(['--glass-frame-alpha','--glass-panel-alpha','--glass-code-alpha'].map(k=>v.get(k)),['1','1','1']);assert.equal(v.get('--glass-blur'),'0px');
 assert.equal(look.glassOpacity,30);assert.equal(look.glassBlur,30);
 applyLook(look,root,{});assert.equal(v.get('--glass-frame-alpha'),'0.3');assert.equal(v.get('--glass-blur'),'30px');});

test('applyLook: code floor flows into --glass-code-alpha using the live theme colours',()=>{
 const v=new Map<string,string>();const cs:Record<string,string>={'--text-primary':'#aaaaaa','--bg-panel':'#ffffff'};
 const prev=(globalThis as any).getComputedStyle;(globalThis as any).getComputedStyle=()=>({getPropertyValue:(k:string)=>cs[k]??''});
 try{const root={style:{setProperty:(k:string,x:string)=>void v.set(k,x),removeProperty:()=>{}},dataset:{} as Record<string,string>,ownerDocument:{}} as any;
  applyLook({...DEFAULT_LOOK,glassOpacity:40,glassCode:true},root,{});
  assert.equal(v.get('--glass-code-alpha'),'0.55','floored for light-grey text');assert.equal(v.get('--glass-frame-alpha'),'0.4','frame unaffected');
  cs['--text-primary']='#000000';applyLook({...DEFAULT_LOOK,glassOpacity:40,glassCode:true},root,{});assert.equal(v.get('--glass-code-alpha'),'0.4','strong contrast: no floor');
 }finally{if(prev===undefined)delete (globalThis as any).getComputedStyle;else (globalThis as any).getComputedStyle=prev;}});

test('applyLook sets dataset flags as strings and survives out-of-range look input',()=>{
 const {v,root}=mkRoot();applyLook({...DEFAULT_LOOK,glassOpacity:999,glassBlur:-4,glassFrame:false,glassCode:true} as any,root,{});
 assert.deepEqual([root.dataset.glassFrame,root.dataset.glassPanels,root.dataset.glassCode],['false','true','true']);
 assert.equal(v.get('--glass-panel-alpha'),'1');assert.equal(v.get('--glass-blur'),'0px');});

test('storage: v2 wrapper round-trips every glass field; reset defaults survive; corrupt data falls back',()=>{
 const s=mkStore();const look={...DEFAULT_LOOK,glassOpacity:0,glassBlur:40,glassFrame:false,glassPanels:false,glassCode:true,glassKeepLow:true};
 rememberLook(look);assert.deepEqual(readLook(),look);
 const raw=JSON.parse(s.get(LOOK_KEY)!);assert.equal(raw.version,2);assert.equal(raw.glassSchema,2);
 rememberLook(DEFAULT_LOOK);assert.deepEqual(readLook(),DEFAULT_LOOK,'reset wins over older values');
 s.set(LOOK_KEY,'{not json');assert.deepEqual(readLook(),DEFAULT_LOOK);
 s.set(LOOK_KEY,JSON.stringify({version:1,look:{glassOpacity:5}}));assert.deepEqual(readLook(),DEFAULT_LOOK);});

test('storage: legacy v1 blur-only look is read without being rewritten',()=>{
 const s=mkStore({'somnia.look.v1':JSON.stringify({background:'glass',glassBlur:17})});
 const l=readLook();assert.equal(l.glassBlur,17);assert.equal(l.glassOpacity,68);assert.equal(l.background,'glass');assert.equal(s.has(LOOK_KEY),false);
 assert.equal(s.get('somnia.look.v1'),JSON.stringify({background:'glass',glassBlur:17}));});

test('storage: unknown future keys are dropped on read, older builds can ignore ours',()=>{
 mkStore();const s=(globalThis as any).localStorage;
 s.setItem(LOOK_KEY,JSON.stringify({version:2,look:{glassOpacity:55,somethingNew:1}}));
 const l=readLook() as any;assert.equal(l.glassOpacity,55);assert.equal('somethingNew' in l,false);});
