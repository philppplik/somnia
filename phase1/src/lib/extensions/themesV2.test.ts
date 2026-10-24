import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {parseManifestV2,validateManifestV2} from './manifestV2';
import {ContributionRegistry,NativeContributionStore} from './contributions';
import {UI_COLOR_TOKENS,contrastRatio,nativeUiThemeValidator} from './themeTokensV2';
const fresh=()=>structuredClone(example);
const invalid=(m:unknown,path:string)=>{const r=validateManifestV2(m); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path===path),JSON.stringify(r.errors));};

/** The app's own shipped dark and light UI color tokens, lifted from the real stylesheet. */
function appThemes():Record<string,string>[] {
 const css=readFileSync(new URL('../../styles/tokens.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const dark:Record<string,string>={},light:Record<string,string>={};
 // Merge every bare :root block (dark defaults) and every :root[data-theme=light] block (light
 // overrides) in document order; palette/motion/media blocks do not define the base tokens.
 for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const selector=m[1]!.trim(),body=m[2]!;
  const target=selector===':root'?dark:selector===':root[data-theme=light]'?light:undefined;
  if(!target) continue;
  for(const decl of body.matchAll(/(--[\w-]+)\s*:\s*(#[a-f\d]{3,8})\s*;/gi)) if((UI_COLOR_TOKENS as readonly string[]).includes(decl[1]!)) target[decl[1]!]=decl[2]!;
 }
 return [dark,light];
}

test('example manifest carries both theme kinds through TOML round-trip',()=>{
 const r=parseManifestV2(stringify(fresh()),{somniaVersion:'12.3.0',apiVersion:'2.0.0'});
 assert.equal(r.ok,true); if(r.ok) assert.deepEqual(JSON.parse(JSON.stringify(r.manifest)),fresh());
});

test('schema rejects bad kind, missing mode and unknown keys',()=>{
 const m:any=fresh(); m.contributes.themes[0].kind='neon'; invalid(m,'/contributes/themes/0/kind');
 const l:any=fresh(); delete l.contributes.themes[0].mode; invalid(l,'/contributes/themes/0/mode');
 const x:any=fresh(); x.contributes.themes[0].script='evil()'; invalid(x,'/contributes/themes/0/script');
});

test('theme path must be a safe package path',()=>{
 const m:any=fresh(); m.contributes.themes[0].path='../escape/theme.json'; invalid(m,'/contributes/themes/0/path');
 const abs:any=fresh(); abs.contributes.themes[0].path='/etc/passwd'; invalid(abs,'/contributes/themes/0/path');
});

test('the shipped dark and light UI themes pass the native validator',()=>{
 for(const tokens of appThemes()) assert.ok(nativeUiThemeValidator(tokens),JSON.stringify(tokens));
});

test('native UI validator enforces coverage, hex colors and contrast',()=>{
 const [valid]=appThemes();
 assert.ok(valid);
 const partial={...valid}; delete partial['--bg-hover'];
 assert.equal(nativeUiThemeValidator(partial),false);
 const unknown={...valid,'--evil-token':'#fff'} as Record<string,string>;
 assert.equal(nativeUiThemeValidator(unknown),false);
 const ref={...valid,'--accent':'var(--bg-base)'};
 assert.equal(nativeUiThemeValidator(ref),false);
 const lowContrast={...valid,'--text-primary':valid['--bg-base']};
 assert.equal(nativeUiThemeValidator(lowContrast),false);
 const badAccentFill={...valid,'--accent-fill':'#ffffff'};
 assert.equal(nativeUiThemeValidator(badAccentFill),false);
});

test('contrast math matches WCAG reference points',()=>{
 assert.equal(contrastRatio('#000','#fff'),21);
 assert.ok(Math.abs(contrastRatio('#777','#fff')-4.48)<0.01);
 assert.ok(Math.abs(contrastRatio('#6164ec','#fff')-4.6)<0.1); // the app's dark accent-fill
});

test('registry validates code themes with syntax tokens and ui themes with the native validator',()=>{
 const codeTheme=new TextEncoder().encode(JSON.stringify({'--syntax-tag':'#7ee787','--syntax-keyword':'#ff7b72'}));
 const badCodeTheme=new TextEncoder().encode(JSON.stringify({'--bg-base':'#0e0e10'})); // UI token in a code theme
 const uiTheme=new TextEncoder().encode(JSON.stringify(appThemes()[0]));
 const m:any=fresh();
 m.contributes={themes:[
  {id:'code-dark',label:'Code Dark',kind:'code',mode:'dark',path:'themes/code-dark.json'},
  {id:'paper',label:'Paper',kind:'ui',mode:'light',path:'themes/ui-light.json'},
 ]};
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(m,{'themes/code-dark.json':codeTheme,'themes/ui-light.json':uiTheme});
 const items=[...store.snapshot().items.values()];
 assert.equal(items.length,2);
 assert.deepEqual(items.map(i=>i.fullId).sort(),['acme.word-count.code-dark','acme.word-count.paper']);
 registry.remove('acme.word-count');
 assert.equal(store.snapshot().items.size,0);
 const registry2=new ContributionRegistry(new NativeContributionStore());
 assert.throws(()=>registry2.register(m,{'themes/code-dark.json':badCodeTheme,'themes/ui-light.json':uiTheme}),/Theme tokens or contrast checks failed/);
 assert.throws(()=>registry2.register(m,{'themes/code-dark.json':codeTheme}),/asset is missing/);
});

test('theme assets obey the 64 KiB budget',()=>{
 const m:any=fresh(); m.contributes={themes:[m.contributes.themes[0]]};
 const big=new TextEncoder().encode(JSON.stringify({'--syntax-tag':'#'.padEnd(66*1024,'1')}));
 const registry=new ContributionRegistry(new NativeContributionStore());
 assert.throws(()=>registry.register(m,{'themes/code-dark.json':big}),/budget/);
});
