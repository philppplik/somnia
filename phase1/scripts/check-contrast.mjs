import {readFileSync} from 'node:fs';
const css=readFileSync('src/styles/tokens.css','utf8');
const blocks=[];
const re=/([^{}]+)\{([^{}]*)\}/g;let m;
while((m=re.exec(css))){
 const sel=m[1].trim();const vars={};
 for(const d of m[2].split(';')){const i=d.indexOf(':');if(i<0)continue;const k=d.slice(0,i).trim();const v=d.slice(i+1).trim();if(k.startsWith('--')&&/^#[0-9a-fA-F]{3,8}$/.test(v))vars[k]=v;}
 blocks.push({sel,vars});
}
const hex=(h)=>{h=h.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};
const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const ratio=(a,b)=>{const x=lum(hex(a)),y=lum(hex(b));return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
// assemble themes: dark = :root; light = root+light; palette = base theme + palette block
const root=blocks.find(b=>b.sel===':root').vars;
const light=blocks.find(b=>b.sel.includes('data-theme=light')&&!b.sel.includes('palette')).vars;
const themes={dark:{...root},light:{...root,...light}};
for(const b of blocks){const p=b.sel.match(/data-palette=([a-z]+)/);if(!p)continue;const themeName=b.sel.includes('data-theme=light')?'light':'dark';const base=themeName==='light'?themes.light:themes.dark;themes[themeName+':'+p[1]]={...base,...b.vars};}
const TEXT=['--text-primary','--text-secondary','--text-tertiary'];
const STATUS=['--accent','--warning','--danger'];
const BG=['--bg-base','--bg-panel','--bg-elevated','--bg-surface','--bg-hover','--canvas-bg','--shell-bg'];
let fails=0,warns=0;
// WCAG AA: text tokens need 4.5:1 on every shell background; status tokens double as small text (links, notices), so they are held to the same bar (3:1 would cover non-text use only).
for(const [name,v] of Object.entries(themes)){
 if(!v)continue;
 for(const tk of TEXT)for(const bk of BG){
  if(!v[tk]||!v[bk])continue;
  const r=ratio(v[tk],v[bk]);
  if(r<4.5){fails++;console.log(`FAIL ${name} ${tk} on ${bk}: ${r.toFixed(2)} (${v[tk]} on ${v[bk]})`);}
 }
 for(const tk of STATUS)for(const bk of BG){
  if(!v[tk]||!v[bk])continue;
  const r=ratio(v[tk],v[bk]);
  if(r<3){fails++;console.log(`FAIL(status<3) ${name} ${tk} on ${bk}: ${r.toFixed(2)} (${v[tk]} on ${v[bk]})`);}
  else if(r<4.5){warns++;fails++;console.log(`FAIL(status<4.5) ${name} ${tk} on ${bk}: ${r.toFixed(2)} (${v[tk]} on ${v[bk]})`);}
 }
}
console.log(`${fails===0?'OK':'FAIL'}: ${fails} contrast failures across ${Object.keys(themes).length} themes`);
if(fails>0)process.exit(1);
