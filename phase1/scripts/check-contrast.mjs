/** WCAG contrast audit over tokens.css: text and status colors against every shell background,
 *  white action ink on --accent-fill, text over --accent-soft overlays (alpha-composited
 *  per background), and status ink on its own surface, for dark, light and every palette. Fails (exit 1) below 4.5:1 — status
 *  colors double as small text (links, notices, pressed buttons), so 3:1 is not enough. */
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/styles/tokens.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const blocks=[];
const re=/([^{}]+)\{([^{}]*)\}/g;let m;
while((m=re.exec(css))){
 const sel=m[1].trim();const vars={};
 for(const d of m[2].split(';')){
  const i=d.indexOf(':');if(i<0)continue;
  const k=d.slice(0,i).trim();const v=d.slice(i+1).trim();
  if(!k.startsWith('--'))continue;
  const hexM=v.match(/^#([0-9a-fA-F]{3,8})$/);
  if(hexM)vars[k]={rgb:hex(hexM[1]),alpha:hexAlpha(hexM[1]),raw:v};
  const rgbaM=v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if(rgbaM)vars[k]={rgb:[+rgbaM[1],+rgbaM[2],+rgbaM[3]],alpha:rgbaM[4]===undefined?1:+rgbaM[4],raw:v};
  const refM=v.match(/^var\((--[a-z0-9-]+)\)$/);
  if(refM)vars[k]={ref:refM[1],raw:v};
 }
 blocks.push({sel,vars});
}
function hexAlpha(h){if(h.length===4)return parseInt(h[3]+h[3],16)/255;if(h.length===8)return parseInt(h.slice(6,8),16)/255;return 1;}
function hex(h){if(h.length===3||h.length===4)h=h.split('').map(c=>c+c).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}

const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
const over=(fg,bg)=>fg.rgb.map((c,i)=>Math.round(c*fg.alpha+bg.rgb[i]*(1-fg.alpha)));

const merge=(pred)=>Object.assign({},...blocks.filter(pred).map(b=>b.vars));
const root=merge(b=>b.sel===':root');
const light=merge(b=>b.sel.includes('data-theme=light')&&!b.sel.includes('data-palette='));
const themes={dark:{...root},light:{...root,...light}};
for(const b of blocks){
 const p=b.sel.match(/data-palette=([a-z]+)/);if(!p)continue;
 const t=b.sel.includes('data-theme=light')?'light':'dark';
 themes[t+':'+p[1]]={...themes[t],...b.vars};
}
for(const v of Object.values(themes)){
 for(const k of Object.keys(v)){
  let hops=0;
  while(v[k]&&v[k].ref&&hops++<4){
   const t=v[v[k].ref];
   if(!t){delete v[k];break;}
   v[k]=t.ref?{ref:t.ref,raw:v[k].raw}:{rgb:t.rgb,alpha:t.alpha,raw:v[k].raw+'='+t.raw};
  }
  if(v[k]&&v[k].ref)delete v[k];
 }
}
const TEXT=['--text-primary','--text-secondary','--text-tertiary'];
const STATUS=['--accent','--warning','--danger'];
const BG=['--bg-base','--bg-panel','--bg-elevated','--bg-surface','--bg-hover','--canvas-bg','--shell-bg'];
const WHITE={rgb:[255,255,255],alpha:1,raw:'#fff'};
let fails=0;
const fail=(msg)=>{fails++;console.log('FAIL '+msg);};
for(const [name,v] of Object.entries(themes)){
 for(const tk of [...TEXT,...STATUS])for(const bk of BG){
  if(!v[tk]||!v[bk])continue;
  const r=ratio(v[tk].rgb,v[bk].rgb);
  if(r<4.5)fail(`${name} ${tk} on ${bk}: ${r.toFixed(2)} (${v[tk].raw} on ${v[bk].raw})`);
 }
 // white action ink on the filled accent button
 if(v['--accent-fill']){
  const r=ratio(WHITE.rgb,v['--accent-fill'].rgb);
  if(r<4.5)fail(`${name} action-ink #fff on --accent-fill: ${r.toFixed(2)} (${v['--accent-fill'].raw})`);
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
 for(const [ik,sk] of [['--status-info-ink','--status-info-surface'],['--status-success-ink','--status-success-surface'],['--status-warning-ink','--status-warning-surface'],['--status-danger-ink','--status-danger-surface']]){
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
}
console.log(`${fails===0?'OK':'FAIL'}: ${fails} contrast failures across ${Object.keys(themes).length} themes`);
if(fails>0)process.exit(1);
