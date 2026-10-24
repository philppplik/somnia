import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {contrastRatio,parseColor,type Rgb} from './a11y';

/**
 * Contrast audit of the shell colour tokens (styles/tokens.css and themes/*.css) for every theme x palette.
 * Shell text (menus, tabs, pills, rails, status bar) uses text-primary / text-secondary / text-tertiary
 * on the bg-* tokens and accent for the active tab/pill. WCAG AA: 4.5:1 for normal text.
 */
const themeDir=new URL('../themes/',import.meta.url);
const css=[readFileSync(new URL('../styles/tokens.css',import.meta.url),'utf8'),...readdirSync(themeDir).filter(f=>f.endsWith('.css')).map(f=>readFileSync(new URL(f,themeDir),'utf8'))].join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
type Tokens=Record<string,string>;
const blocks:{sel:string;t:Tokens}[]=[];
for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){const t:Tokens={};for(const d of m[2].split(';')){const i=d.indexOf(':');if(i>0&&d.trim().startsWith('--'))t[d.slice(0,i).trim()]=d.slice(i+1).trim();}blocks.push({sel:m[1].trim(),t});}
const has=(sel:string,needle:string)=>sel.includes(needle);
/** Tokens that apply to theme + optional palette, in cascade order (specificity grows with attributes). */
export function resolve(theme:'dark'|'light',palette?:string):Tokens{
 const out:Tokens={};
 const matching=blocks.filter(b=>{
  const themeAttr=/data-theme=(\w+)/.exec(b.sel)?.[1];const pal=/data-palette=([\w-]+)/.exec(b.sel)?.[1];
  if(themeAttr&&themeAttr!==theme)return false;
  if(pal&&pal!==palette)return false;
  return /^:root(\[[^\]]+\])*$/.test(b.sel);
 });
 matching.sort((a,b)=>(a.sel.match(/\[/g)?.length??0)-(b.sel.match(/\[/g)?.length??0));
 for(const b of matching)Object.assign(out,b.t);
 return out;
}
const palettes=[...new Set([...css.matchAll(/data-palette=([\w-]+)/g)].map(m=>m[1]))];
const combos:[ 'dark'|'light',string|undefined][]=[['dark',undefined],['light',undefined],...palettes.map(p=>{const th=blocks.find(b=>has(b.sel,'data-palette='+p))!.sel.match(/data-theme=(\w+)/)?.[1] as 'dark'|'light';return [th,p] as ['dark'|'light',string]})];
const color=(t:Tokens,k:string):Rgb|null=>{const v=t[k];return v?parseColor(v):null;};
const bgs=['--bg-base','--bg-panel','--bg-elevated','--bg-surface','--bg-hover'];
for(const [theme,palette] of combos){
 test(`shell text contrast AA: ${theme}${palette?'/'+palette:''}`,()=>{
  const t=resolve(theme,palette);const fails:string[]=[];
  for(const bg of bgs){const b=color(t,bg);if(!b)continue;
   for(const fg of ['--text-primary','--text-secondary','--text-tertiary','--accent']){const f=color(t,fg);if(!f)continue;const r=contrastRatio(f,b);if(r<4.5)fails.push(`${fg} on ${bg}: ${r.toFixed(2)}`);}}
  assert.deepEqual(fails,[]);
 });
}

test('contrast audit covers the built-in and themes/*.css palettes',()=>{
 assert.ok(palettes.includes('crimson')&&palettes.includes('crimsonlight')&&palettes.includes('blueice'));
 assert.ok(combos.length>=15,String(combos.length));
 for(const [theme,palette] of combos)assert.ok(color(resolve(theme,palette),'--bg-panel'),`${theme}/${palette} resolves tokens`);
});

test('update pill uses a green with 4.5:1 against its white label',()=>{
 const src=readFileSync(new URL('../components/UpdatePill.tsx',import.meta.url),'utf8');
 assert.match(src,/bg-emerald-700/);
 assert.ok(contrastRatio([255,255,255],parseColor('#047857')!)>=4.5);
 assert.ok(contrastRatio([255,255,255],parseColor('#059669')!)<4.5,'old emerald-600 was below AA');
});
