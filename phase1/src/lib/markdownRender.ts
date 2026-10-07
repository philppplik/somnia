/** Markdown renderer for the preview, built on markdown-it. The library is loaded on demand (dynamic import) so source editing never waits for it.
 * Security boundary: raw HTML is off (html:false), links go through safeUrl, images only through the trusted resolver (no remote images), and every
 * attribute that is not produced here is escaped. The output is injected into the app DOM (an <article>, not an iframe), so nothing in it may come from source HTML. */
import type {MarkdownIt,Token,Env} from 'markdown-it';
import {extractMath,PLACEHOLDER,type MathWarning} from './mathExtract';
import type {MathSink} from './mathRender';
/** Only web, mail and in-page links, or plain relative paths. Anything with another scheme (javascript:, data:, ...) is dropped. */
export function safeUrl(raw:string):string|null{
 const u=raw.trim().replace(/[\u0000-\u001f\u007f\s]/g,'');
 if(!u)return null;
 if(/^(https?:|mailto:|#)/i.test(u))return u;
 if(/^[a-z][a-z0-9+.-]*:/i.test(u)||u.startsWith('//'))return null;
 return u;}
export interface MdOptions{/** Turn math into formulas. The sink collects counts and errors; omit to leave $...$ as plain text. */math?:MathSink;/** Resolves an image path to a displayable URL (e.g. an opened PNG). Return null when unknown. */resolveImage?:(src:string)=>string|null}
/** A mapped block of the rendered output. Lines are zero-based and half-open: [start,end). */
export interface MdBlock{start:number;end:number}
export interface MdResult{html:string;blocks:MdBlock[];warnings:MathWarning[]}
const decode=(s:string)=>{try{return decodeURIComponent(s);}catch{return s;}};
const slugOf=(s:string)=>s.replace(/\u0001\d+\u0001/g,'').trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s+/g,'-')||'section';
function build(MarkdownItCtor:typeof import('markdown-it').default,footnote:(md:MarkdownIt)=>void){
 const md=new MarkdownItCtor({html:false,linkify:false,typographer:false,breaks:false});
 md.validateLink=(u:string)=>safeUrl(decode(u))!==null&&!/^(\/\/|[a-z][a-z0-9+.-]*:(?!\/\/)(?!https?:|mailto:))/i.test(u.trim().replace(/[\u0000-\u001f\u007f\s]/g,''));
 md.use(footnote);
 const esc=md.utils.escapeHtml;
 // Task list items: "[ ] x" / "[x] x" become a disabled checkbox made by this renderer.
 md.core.ruler.push('somnia_tasks',state=>{const t=state.tokens;for(let i=2;i<t.length;i++){
  if(t[i].type!=='inline'||t[i-1].type!=='paragraph_open'||t[i-2].type!=='list_item_open')continue;
  const m=/^\[([ xX])\]\s+/.exec(t[i].content);if(!m)continue;const first=t[i].children?.[0];if(!first||first.type!=='text')continue;
  first.content=first.content.replace(/^\[[ xX]\]\s+/,'');t[i].content=t[i].content.slice(m[0].length);
  const box=new state.Token('somnia_task','',0);box.meta={checked:m[1]!==' '};t[i].children!.unshift(box);t[i-2].attrJoin('class','md-task');}});
 // Deterministic heading anchors with numeric suffixes for duplicates. Generated here, never taken from source.
 md.core.ruler.push('somnia_anchors',state=>{const used=new Set<string>();const t=state.tokens;for(let i=0;i<t.length;i++){
  if(t[i].type!=='heading_open')continue;const base=slugOf(t[i+1]?.content??'');let id=base,n=1;while(used.has(id))id=`${base}-${n++}`;used.add(id);t[i].attrSet('id',id);}});
 // Source line mapping: every mapped block token carries start-end (zero-based, half-open). Overwrites anything, source cannot supply attributes (html:false).
 md.core.ruler.push('somnia_map',state=>{for(const tok of state.tokens){if(tok.block&&tok.map&&tok.type!=='inline'&&(tok.nesting===1||tok.nesting===0))tok.attrSet('data-md',`${tok.map[0]}-${tok.map[1]}`);}});
 md.renderer.rules.somnia_task=(tokens:Token[],i:number)=>`<input type="checkbox" disabled${(tokens[i].meta as {checked:boolean}).checked?' checked':''}> `;
 md.renderer.rules.link_open=(tokens,i,o,_e,self)=>{const t=tokens[i];const ok=safeUrl(decode(String(t.attrGet('href')??'')));if(!ok){t.attrSet('href','#');}else t.attrSet('href',ok);return self.renderToken(tokens,i,o);};
 md.renderer.rules.image=(tokens,i,o,env,self)=>{const opts=(env as {opts?:MdOptions}|undefined)?.opts;
  const t=tokens[i];const alt=self.renderInlineAsText(t.children??[],o,env);const raw=decode(String(t.attrGet('src')??''));const ok=safeUrl(raw);
  const url=ok&&!/^(https?:|mailto:|#)/i.test(ok)?(opts?.resolveImage?.(ok)??null):null;
  if(!url)return `<span class="md-missing-image">[image: ${esc(alt||raw)}]</span>`;
  const title=t.attrGet('title')?String(t.attrGet('title')):'';return `<img src="${esc(url)}" alt="${esc(alt)}"${title?` title="${esc(title)}"`:''}>`;};
 return md;}
type Renderer=(src:string,o?:MdOptions)=>MdResult;
let loading:Promise<Renderer>|null=null;let ready:Renderer|null=null;
/** Loads markdown-it once. Resolves to the render function. */
export function loadMarkdown():Promise<Renderer>{
 return loading??=Promise.all([import('markdown-it'),import('markdown-it-footnote')]).then(([m,f])=>{
  const md=build((m.default??m) as typeof import('markdown-it').default,(f.default??f) as (md:MarkdownIt)=>void);
  ready=(src,o={})=>{const env={opts:o};let text=src.replace(/\r\n?/g,'\n');let items:ReturnType<typeof extractMath>['items']=[];let warnings:MathWarning[]=[];
   if(o.math){// Math is pulled out before markdown-it sees it (so _ and * inside formulas stay literal) and put back as formula HTML afterwards.
    // keepLines pads each placeholder with one marker line per source line it replaced, so data-md line maps stay true to the editor.
    const x=extractMath(text.replace(/[\u0001\u0002]/g,' '),{keepLines:true});text=x.text;items=x.items;warnings=x.warnings;}
   let html=md.render(text,env);
   if(o.math){const sink=o.math;
    // Text positions get the formula; placeholders that landed inside a tag attribute (link title, image alt) are dropped so no markup can enter an attribute.
    html=html.split(/(<[^>]*>)/).map(seg=>seg.startsWith('<')&&seg.endsWith('>')?seg.replace(PLACEHOLDER,''):seg.replace(PLACEHOLDER,(_m,i:string)=>items[+i]?sink.fn(items[+i]):'')).join('').replace(/\u0002/g,'');}
   const blocks:MdBlock[]=[];
   for(const mm of html.matchAll(/data-md="(\d+)-(\d+)"/g))blocks.push({start:+mm[1],end:+mm[2]});return {html,blocks,warnings};};
  return ready;});}
export const markdownReady=()=>ready!==null;
/** Synchronous render, valid after loadMarkdown() resolved. Returns the HTML only. */
export function renderMarkdown(src:string,o:MdOptions={}):string{if(!ready)throw new Error('Markdown renderer is not loaded yet');return ready(src,o).html;}
export function renderMarkdownBlocks(src:string,o:MdOptions={}):MdResult{if(!ready)throw new Error('Markdown renderer is not loaded yet');return ready(src,o);}

/** Render plus math warnings (for example an unclosed $$). Valid after loadMarkdown() resolved. */
export function renderMarkdownEx(src:string,o:MdOptions={}):{html:string;warnings:MathWarning[]}{const r=renderMarkdownBlocks(src,o);return{html:r.html,warnings:r.warnings};}
