/** WCAG contrast audit: dark/light + the inline palettes (tokens.css), every palette file in
 *  src/themes/*.css, and both high-contrast modes (global.css data-contrast=high overrides).
 *  Per theme variant: text + status colors on every shell background, the resolved action ink
 *  (--action-ink -> var(--accent-ink, #fff)) on --accent-fill, text/accent on --accent-soft
 *  alpha-composited over every background, and status ink on its own surface.
 *  Fails (exit 1) below 4.5:1 — status colors double as small text, so 3:1 is not enough. */
import {readFileSync,readdirSync} from 'node:fs';

function hexAlpha(h){if(h.length===4)return parseInt(h[3]+h[3],16)/255;if(h.length===8)return parseInt(h.slice(6,8),16)/255;return 1;}
function hex(h){if(h.length===3||h.length===4)h=h.split('').map(c=>c+c).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}

const parse=(css)=>{
 css=css.replace(/\/\*[\s\S]*?\*\//g,'');
 const blocks=[];
 const re=/([^{}]+)\{([^{}]*)\}/g;let m;
 while((m=re.exec(css))){
  const sel=m[1].trim().replace(/:not\([^)]*\)/g,'');
  const vars={};
  for(const d of m[2].split(';')){
   const i=d.indexOf(':');if(i<0)continue;
   const k=d.slice(0,i).trim();const v=d.slice(i+1).trim().replace(/!important$/,'');
   if(!k.startsWith('--'))continue;
   const hexM=v.match(/^#([0-9a-fA-F]{3,8})$/);
   if(hexM){vars[k]={rgb:hex(hexM[1]),alpha:hexAlpha(hexM[1]),raw:v};continue;}
   const rgbaM=v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
   if(rgbaM){vars[k]={rgb:[+rgbaM[1],+rgbaM[2],+rgbaM[3]],alpha:rgbaM[4]===undefined?1:+rgbaM[4],raw:v};continue;}
   const cmM=v.match(/^color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,8})\s+([\d.]+)%\s*,\s*transparent\s*\)$/);
   if(cmM){vars[k]={rgb:hex(cmM[1]),alpha:+cmM[2]/100,raw:v};continue;}
   const refM=v.match(/^var\((--[a-z0-9-]+)\s*(?:,\s*(#[0-9a-fA-F]{3,8})\s*)?\)$/);
   if(refM)vars[k]={ref:refM[1],fb:refM[2],raw:v};
  }
  blocks.push({sel,vars});
 }
 return blocks;
};

const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
const over=(fg,bg)=>fg.rgb.map((c,i)=>Math.round(c*fg.alpha+bg.rgb[i]*(1-fg.alpha)));

const here=(p)=>new URL(p,import.meta.url);
const tokenBlocks=parse(readFileSync(here('../src/styles/tokens.css'),'utf8'));
const globalBlocks=parse(readFileSync(here('../src/styles/global.css'),'utf8'));
const themeDir=here('../src/themes/');
const paletteBlocks=readdirSync(themeDir).filter(f=>f.endsWith('.css'))
 .flatMap(f=>parse(readFileSync(new URL(f,themeDir),'utf8')));

const attrs=(sel)=>Object.fromEntries([...sel.matchAll(/\[([\w-]+)=["']?([\w-]+)["']?\]/g)].map(a=>[a[1],a[2]]));
const merge=(blocks,pred)=>Object.assign({},...blocks.filter(b=>pred(attrs(b.sel))).map(b=>b.vars));

const dark=merge(tokenBlocks,a=>Object.keys(a).length===0);
const light={...dark,...merge(tokenBlocks,a=>a['data-theme']==='light'&&!a['data-palette']&&!a['data-contrast']&&!a['data-motion'])};
const themes={dark,light};
for(const b of [...tokenBlocks,...paletteBlocks]){
 const a=attrs(b.sel);
 if(!a['data-palette']||!a['data-theme']||a['data-contrast'])continue;
 const key=a['data-theme']+':'+a['data-palette'];
 themes[key]={...(themes[key]||(a['data-theme']==='light'?light:dark)),...b.vars};
}
themes['hc-light']={...light,...merge(globalBlocks,a=>a['data-contrast']==='high'&&a['data-theme']!=='dark'&&!a['data-palette'])};
themes['hc-dark']={...dark,...merge(globalBlocks,a=>a['data-contrast']==='high'&&!a['data-palette'])};

// resolve var(--x[, fallback]) aliases through the merged theme (status ink/surface, action ink)
for(const v of Object.values(themes)){
 for(const k of Object.keys(v)){
  let hops=0;
  while(v[k]&&v[k].ref&&hops++<4){
   const t=v[v[k].ref];
   if(!t){v[k]=v[k].fb?{rgb:hex(v[k].fb),alpha:hexAlpha(v[k].fb),raw:v[k].raw}:undefined;if(!v[k])delete v[k];break;}
   v[k]=t.ref?{ref:t.ref,fb:v[k].fb,raw:v[k].raw}:{rgb:t.rgb,alpha:t.alpha,raw:v[k].raw+'='+t.raw};
  }
  if(v[k]&&v[k].ref)delete v[k];
 }
}

const TEXT=['--text-primary','--text-secondary','--text-tertiary'];
const STATUS=['--accent','--warning','--danger'];
const BG=['--bg-base','--bg-panel','--bg-elevated','--bg-surface','--bg-hover','--canvas-bg','--shell-bg'];
const PAIRS=[['--status-info-ink','--status-info-surface'],['--status-success-ink','--status-success-surface'],['--status-warning-ink','--status-warning-surface'],['--status-danger-ink','--status-danger-surface']];
let fails=0,warns=0;
const fail=(msg)=>{fails++;console.log('FAIL '+msg);};
for(const [name,v] of Object.entries(themes)){
 for(const tk of [...TEXT,...STATUS])for(const bk of BG){
  if(!v[tk]||!v[bk])continue;
  const r=ratio(v[tk].rgb,v[bk].rgb);
  if(r<4.5)fail(`${name} ${tk} on ${bk}: ${r.toFixed(2)} (${v[tk].raw} on ${v[bk].raw})`);
 }
 // action ink (--accent-ink or white) on the filled accent button
 if(v['--accent-fill']&&v['--action-ink']){
  const r=ratio(v['--action-ink'].rgb,v['--accent-fill'].rgb);
  if(r<4.5)fail(`${name} --action-ink on --accent-fill: ${r.toFixed(2)} (${v['--action-ink'].raw} on ${v['--accent-fill'].raw})`);
 }
 // text over accent-soft overlays (menu highlight, pressed buttons, checked options, badges)
 const soft=v['--accent-soft'];
 if(soft)for(const bk of BG){
  if(!v[bk])continue;
  const comp=over(soft,v[bk]);
  for(const tk of ['--text-primary','--text-secondary','--accent']){
   if(!v[tk])continue;
   const r=ratio(v[tk].rgb,comp);
   if(r<4.5)fail(`${name} ${tk} on accent-soft+${bk}: ${r.toFixed(2)} (${v[tk].raw} on ${soft.raw} over ${v[bk].raw})`);
  }
 }
 // status ink on its own surface (badges, notices, banners); alpha surfaces composite per background
 for(const [ik,sk] of PAIRS){
  const ink=v[ik],sur=v[sk];
  if(!ink||!sur)continue;
  if(sur.alpha<1){
   for(const bk of BG){
    if(!v[bk])continue;
    const r=ratio(ink.rgb,over(sur,v[bk]));
    if(r<4.5)fail(`${name} ${ik} on ${sk}+${bk}: ${r.toFixed(2)} (${ink.raw} on ${sur.raw} over ${v[bk].raw})`);
   }
  }else{
   const r=ratio(ink.rgb,sur.rgb);
   if(r<4.5)fail(`${name} ${ik} on ${sk}: ${r.toFixed(2)} (${ink.raw} on ${sur.raw})`);
  }
 }
 // filled danger button: resolved --danger-ink (fallback white) on --danger
 if(v['--danger']){
  const ink=v['--danger-ink']||{rgb:[255,255,255],raw:'#fff'};
  const r=ratio(ink.rgb,v['--danger'].rgb);
  if(r<4.5)fail(`${name} --danger-ink on --danger: ${r.toFixed(2)} (${ink.raw} on ${v['--danger'].raw})`);
 }
 // non-text: focus ring must stand out from every background (WCAG 1.4.11, 3:1)
 if(v['--focus-ring'])for(const bk of BG){
  if(!v[bk])continue;
  const r=ratio(v['--focus-ring'].rgb,v[bk].rgb);
  if(r<3)fail(`${name} --focus-ring on ${bk}: ${r.toFixed(2)} (${v['--focus-ring'].raw} on ${v[bk].raw})`);
 }
 // non-text: input/control borders at 3:1 (WCAG 1.4.11) — blocking since they carry the fix
 if(v['--border-control'])for(const bk of ['--bg-base','--bg-panel','--bg-elevated']){
  if(!v[bk])continue;
  const r=ratio(v['--border-control'].rgb,v[bk].rgb);
  if(r<3)fail(`${name} --border-control on ${bk}: ${r.toFixed(2)} (${v['--border-control'].raw} on ${v[bk].raw})`);
 }
 // non-text, advisory only: control borders at 3:1 (WCAG 1.4.11) — dark-mode border
 // subtlety is a design decision, so these warn without failing the audit
 for(const bk of ['--bg-base','--bg-panel','--bg-elevated']){
  if(!v['--border-default']||!v[bk])continue;
  const r=ratio(v['--border-default'].rgb,v[bk].rgb);
  if(r<3){warns++;console.log(`WARN ${name} --border-default on ${bk}: ${r.toFixed(2)} (${v['--border-default'].raw} on ${v[bk].raw})`);}
 }
}
// bento math/TeX status colors: hardcoded light+dark pairs in bento.css, audited as-is
const bentoCss=readFileSync(here('../src/styles/bento.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const BENTO=['.math-error','.math-error-block','.math-pill.ok','.math-pill.err','.math-pill.warn','.tex-banner'];
const bentoPairs={};
for(const m of bentoCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 for(const raw of m[1].split(',')){
  const s=raw.trim();
  const mode=/^\[data-theme=dark\]/.test(s)?'dark':'light';
  const base=s.replace(/^\[data-theme=dark\]\s*/,'').trim();
  if(!BENTO.includes(base))continue;
  const bg=m[2].match(/(?:^|;)\s*background:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/);
  const col=m[2].match(/(?:^|;)\s*color:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/);
  if(bg&&col)bentoPairs[mode+' '+base]={ink:col[1],surface:bg[1]};
 }
}
for(const b of BENTO)for(const mode of ['light','dark']){
 const p=bentoPairs[mode+' '+b];
 if(!p){fail(`bento ${mode} ${b}: no solid background+color pair found`);continue;}
 const r=ratio(hex(p.ink.slice(1)),hex(p.surface.slice(1)));
 if(r<4.5)fail(`bento ${mode} ${b}: ${r.toFixed(2)} (${p.ink} on ${p.surface})`);
}
// diff viewer: +/- sign ink on the alpha-tinted line background, composited per app background
const diffCss=readFileSync(here('../src/styles/global.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const diffBody=(sel)=>{const esc=sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=diffCss.match(new RegExp(esc+'\\{([^}]*)\\}'));return m?m[1]:null;};
const diffHex=(body,prop)=>{const m=body?.match(new RegExp('(?:^|;)\\s*'+prop+':\\s*(#[0-9a-fA-F]{3,8})\\s*(?:;|$)'));return m?m[1]:null;};
for(const side of ['added','removed']){
 const sur=diffHex(diffBody(`.diff-${side}`),'background');
 const inks={light:diffHex(diffBody(`.diff-${side}>span:nth-child(3)`),'color'),dark:diffHex(diffBody(`:root[data-theme=dark] .diff-${side}>span:nth-child(3)`),'color')};
 if(!sur||!inks.light||!inks.dark){fail(`diff .diff-${side}: missing surface or ink rule`);continue;}
 const surT={rgb:hex(sur.slice(1)),alpha:hexAlpha(sur.slice(1))};
 for(const [name,v] of Object.entries(themes)){
  const mode=name.includes('dark')?'dark':'light';
  for(const bk of ['--bg-base','--bg-panel','--bg-surface']){
   if(!v[bk])continue;
   const comp=over(surT,v[bk]);
   const r=ratio(hex(inks[mode].slice(1)),comp);
   if(r<4.5)fail(`diff ${name} .diff-${side} sign on ${bk}: ${r.toFixed(2)} (${inks[mode]} on ${sur} over ${v[bk].raw})`);
  }
 }
}
console.log(`${fails===0?'OK':'FAIL'}: ${fails} contrast failures across ${Object.keys(themes).length} themes${warns?` (+${warns} border warnings)`:''}`);
if(fails>0)process.exit(1);
