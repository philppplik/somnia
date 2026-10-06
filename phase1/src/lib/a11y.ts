import type {Problem} from './diagnostics';
import {maskNonMarkup,tagSource} from './markupMask';
/**
 * Accessibility checker for the Problems panel. Pure text analysis: no DOM, no network.
 * Adds checks on top of the basics in diagnostics.ts (missing alt, lang, title, heading jumps):
 *  - text contrast (WCAG 2.x AA) from inline styles and simple tag/.class/#id CSS rules
 *  - weak alt text (file names, "image of ...") and image inputs without alt
 *  - empty headings, and a first heading that is not h1
 * All results are warnings. Colours it cannot resolve (var(), gradients, images) are skipped, never guessed.
 */
export type Rgb=[number,number,number];
const NAMED:Record<string,string>={black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',blue:'#0000ff',yellow:'#ffff00',gray:'#808080',grey:'#808080',silver:'#c0c0c0',orange:'#ffa500',purple:'#800080',navy:'#000080',teal:'#008080',maroon:'#800000',lime:'#00ff00',aqua:'#00ffff',fuchsia:'#ff00ff',olive:'#808000',lightgray:'#d3d3d3',lightgrey:'#d3d3d3',darkgray:'#a9a9a9',darkgrey:'#a9a9a9',pink:'#ffc0cb'};
/** Parses #rgb, #rrggbb, rgb()/rgba() (opaque only) and a few named colours. Returns null when unsure. */
export function parseColor(v:string):Rgb|null{
 let s=v.trim().toLowerCase().replace(/\s*!important$/,'');if(NAMED[s])s=NAMED[s];
 let m=/^#([0-9a-f]{3})$/.exec(s);if(m)return [...m[1]].map(c=>parseInt(c+c,16)) as Rgb;
 m=/^#([0-9a-f]{6})(?:ff)?$/.exec(s);if(m)return [0,2,4].map(i=>parseInt(m![1].slice(i,i+2),16)) as Rgb;
 m=/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
 if(m){if(m[4]!==undefined){const a=m[4].endsWith('%')?parseFloat(m[4])/100:parseFloat(m[4]);if(a<1)return null;}return [+m[1],+m[2],+m[3]].map(n=>Math.min(255,n)) as Rgb;}
 return null;}
const lin=(c:number)=>{const s=c/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);};
export const luminance=(c:Rgb)=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a:Rgb,b:Rgb):number{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
const decls=(css:string)=>{const o:Record<string,string>={};for(const d of css.split(';')){const i=d.indexOf(':');if(i>0)o[d.slice(0,i).trim().toLowerCase()]=d.slice(i+1).trim();}return o;};
/** The colour in a `background` / `background-color` value, or null if it is an image, gradient or var(). */
const bgOf=(d:Record<string,string>)=>{const v=d['background-color']??d['background'];if(!v||/gradient|url\(|var\(/i.test(v))return null;return parseColor(v.split(/\s+/).find(t=>parseColor(t))??v);};
const fgOf=(d:Record<string,string>)=>{const v=d['color'];return v&&!/var\(/i.test(v)?parseColor(v):null;};
interface Rule{sel:string;d:Record<string,string>}
function rulesFrom(css:string):Rule[]{const out:Rule[]=[];for(const m of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}@]+)\{([^{}]*)\}/g)){const d=decls(m[2]);for(const sel of m[1].split(','))if(/^(?:[a-z][a-z0-9]*|[.#][\w-]+)$/i.test(sel.trim()))out.push({sel:sel.trim(),d});}return out;}
const sizeOk=(d:Record<string,string>)=>{const px=/^([\d.]+)px$/.exec(d['font-size']??'');const big=px&&parseFloat(px[1])>=24;const bold=/^(bold|[6-9]00)$/.test(d['font-weight']??'');const px2=px&&parseFloat(px[1])>=18.66;return !!(big||(bold&&px2));};
/** Contrast warnings for elements whose text and background colours are both known. Large text needs 3:1, other text 4.5:1. */
export function contrastProblems(files:Readonly<Record<string,string>>):Problem[]{
 const out:Problem[]=[];
 const cssRules:Rule[]=[];for(const f of Object.keys(files).sort())if(/\.css$/i.test(f))cssRules.push(...rulesFrom(files[f]));
 for(const f of Object.keys(files).sort()){if(!/\.html?$/i.test(f))continue;const raw=files[f];const text=maskNonMarkup(raw);
  const rules=[...cssRules];for(const m of raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))rules.push(...rulesFrom(m[1]));
  const at=(i:number)=>{const b=text.slice(0,i);return{line:b.split('\n').length,col:b.length-b.lastIndexOf('\n')};};
  const page=rules.filter(r=>r.sel==='body'||r.sel==='html');const pageBg=page.map(r=>bgOf(r.d)).filter(Boolean).pop()??[255,255,255] as Rgb;const pageFg=page.map(r=>fgOf(r.d)).filter(Boolean).pop()??null;
  for(const m of text.matchAll(/<([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){const tag=m[1].toLowerCase();if(/^(html|head|meta|link|script|style|title|img|br|hr|svg|path|source)$/.test(tag))continue;
   const attrs=m[2];const cls=(/\bclass\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]??'').split(/\s+/).filter(Boolean);const id=/\bid\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
   const matched=rules.filter(r=>r.sel===tag||(r.sel[0]==='.'&&cls.includes(r.sel.slice(1)))||(id&&r.sel==='#'+id));
   const inline=decls(/\bstyle\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]??'');const layers=[...matched.map(r=>r.d),inline];
   let fg:Rgb|null=null,bg:Rgb|null=null,size:Record<string,string>={};
   for(const d of layers){const f=fgOf(d),b=bgOf(d);if(f)fg=f;if(b)bg=b;for(const k of ['font-size','font-weight'])if(d[k])size[k]=d[k];}
   if(!fg&&!bg)continue;if(!fg)fg=pageFg;if(!fg)continue;const back=bg??pageBg;
   const ratio=contrastRatio(fg,back),need=sizeOk(size)?3:4.5;
   if(ratio<need)out.push({file:f,...at(m.index!),severity:'warning',message:`Low text contrast on <${tag}>: ${ratio.toFixed(2)}:1, needs ${need}:1 (WCAG AA).`});}}
 return out;}
/** Alt text quality, empty headings and first-heading level. */
export function contentProblems(files:Readonly<Record<string,string>>):Problem[]{
 const out:Problem[]=[];
 for(const f of Object.keys(files).sort()){if(!/\.html?$/i.test(f))continue;const text=maskNonMarkup(files[f]);
  const at=(i:number)=>{const b=text.slice(0,i);return{line:b.split('\n').length,col:b.length-b.lastIndexOf('\n')};};const add=(i:number,message:string)=>out.push({file:f,...at(i),severity:'warning',message});
  for(const m of text.matchAll(new RegExp(tagSource('img'),'gi'))){const alt=/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[0]);const v=(alt?.[1]??alt?.[2]??'').trim();if(!alt||!v)continue;
   if(/\.(png|jpe?g|gif|svg|webp|avif)$/i.test(v)||/^(image|picture|photo|graphic|img)(\s+of)?\b/i.test(v))add(m.index!,`Alt text "${v}" is not descriptive. Say what the image shows.`);}
  for(const m of text.matchAll(/<input\b[^>]*\btype\s*=\s*["']?image["']?[^>]*>/gi))if(!/\balt\s*=\s*["'][^"']+["']/i.test(m[0]))add(m.index!,'Image button has no alt text.');
  for(const m of text.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi))if(!m[2].replace(/<[^>]*>/g,'').trim()&&!/<img\b[^>]*\balt\s*=\s*["'][^"']+/i.test(m[2]))add(m.index!,`Empty <h${m[1]}> heading.`);
  const first=/<h([1-6])\b/i.exec(text);if(first&&first[1]!=='1'&&/<html\b/i.test(text))add(first.index,`The first heading is h${first[1]}. Start the page with an h1.`);}
 return out;}
/** All checks from this module. */
export const a11yProblems=(files:Readonly<Record<string,string>>):Problem[]=>[...contrastProblems(files),...contentProblems(files)];
