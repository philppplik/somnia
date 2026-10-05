/** Small Markdown to HTML renderer for the preview. Every piece of text is escaped and only tags made here are emitted, so the output is safe to inject. */
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Only web, mail and in-page links, or plain relative paths. Anything with another scheme (javascript:, data:, ...) is dropped. */
export function safeUrl(raw:string):string|null{
 const u=raw.trim().replace(/[\u0000-\u001f\u007f\s]/g,'');
 if(!u)return null;
 if(/^(https?:|mailto:|#)/i.test(u))return u;
 if(/^[a-z][a-z0-9+.-]*:/i.test(u)||u.startsWith('//'))return null;
 return u;}
export interface MdOptions{/** Resolves an image path to a displayable URL (e.g. an opened PNG). Return null when unknown. */resolveImage?:(src:string)=>string|null}
function inline(text:string,o:MdOptions):string{
 const codes:string[]=[];
 let t=text.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g,(_m,_f,c:string)=>{codes.push(`<code>${esc(c.trim())}</code>`);return `\u0000${codes.length-1}\u0000`;});
 t=esc(t);
 t=t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,(_m,alt:string,src:string,title?:string)=>{
  const raw=src.replace(/&amp;/g,'&');const ok=safeUrl(raw);const url=ok&&!/^(mailto:|#)/i.test(ok)?(/^https?:/i.test(ok)?null:(o.resolveImage?.(ok)??null)):null;
  return url?`<img src="${esc(url)}" alt="${alt}"${title?` title="${title}"`:''}>`:`<span class="md-missing-image">[image: ${alt||esc(raw)}]</span>`;});
 t=t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,(_m,label:string,href:string,title?:string)=>{
  const ok=safeUrl(href.replace(/&amp;/g,'&'));return ok?`<a href="${esc(ok)}"${title?` title="${title}"`:''}>${label}</a>`:label;});
 t=t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g,(_m,pre:string,url:string)=>`${pre}<a href="${url}">${url}</a>`);
 t=t.replace(/\*\*\*([^*]+)\*\*\*/g,'<strong><em>$1</em></strong>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)/g,'$1<em>$2</em>')
  .replace(/(^|[^\w])__([^_]+)__(?!\w)/g,'$1<strong>$2</strong>').replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g,'$1<em>$2</em>').replace(/~~([^~]+)~~/g,'<del>$1</del>');
 return t.replace(/\u0000(\d+)\u0000/g,(_m,i:string)=>codes[+i]);}
const cells=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
const isTableSep=(l:string)=>/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l)&&l.includes('-');
export function renderMarkdown(src:string,o:MdOptions={}):string{
 const lines=src.replace(/\r\n?/g,'\n').split('\n');const out:string[]=[];let i=0;
 const blockStart=(l:string)=>/^\s{0,3}(#{1,6}\s|>|```|~~~|([-*_])(\s*\2){2,}\s*$)/.test(l)||/^\s*([-*+]|\d+[.)])\s+/.test(l);
 while(i<lines.length){
  const line=lines[i];
  if(!line.trim()){i++;continue;}
  const fence=/^\s{0,3}(```|~~~)\s*([\w+-]*)/.exec(line);
  if(fence){const buf:string[]=[];i++;while(i<lines.length&&!lines[i].trim().startsWith(fence[1])){buf.push(lines[i]);i++;}i++;out.push(`<pre><code${fence[2]?` class="language-${esc(fence[2])}"`:''}>${esc(buf.join('\n'))}</code></pre>`);continue;}
  const h=/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  if(h){out.push(`<h${h[1].length}>${inline(h[2],o)}</h${h[1].length}>`);i++;continue;}
  if(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)){out.push('<hr>');i++;continue;}
  if(/^\s*>/.test(line)){const buf:string[]=[];while(i<lines.length&&/^\s*>/.test(lines[i])){buf.push(lines[i].replace(/^\s*>\s?/,''));i++;}out.push(`<blockquote>${renderMarkdown(buf.join('\n'),o)}</blockquote>`);continue;}
  if(line.includes('|')&&i+1<lines.length&&isTableSep(lines[i+1])){
   const head=cells(line);const align=cells(lines[i+1]).map(c=>/^:-+:$/.test(c)?'center':/-:$/.test(c)?'right':/^:-/.test(c)?'left':'');i+=2;const rows:string[][]=[];
   while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){rows.push(cells(lines[i]));i++;}
   const td=(tag:string,c:string,k:number)=>`<${tag}${align[k]?` style="text-align:${align[k]}"`:''}>${inline(c,o)}</${tag}>`;
   out.push(`<table><thead><tr>${head.map((c,k)=>td('th',c,k)).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${head.map((_c,k)=>td('td',r[k]??'',k)).join('')}</tr>`).join('')}</tbody></table>`);continue;}
  const li=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
  if(li){const ordered=/\d/.test(li[2]);const base=li[1].length;const items:string[]=[];
   while(i<lines.length){const m=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);if(!m||m[1].length<base||(m[1].length===base&&/\d/.test(m[2])!==ordered))break;
    if(m[1].length>base+1){break;}
    let body=m[3];i++;const sub:string[]=[];
    while(i<lines.length&&lines[i].trim()&&(/^\s{2,}\S/.test(lines[i])||/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])&&/^(\s*)/.exec(lines[i])![1].length>base)){sub.push(lines[i].replace(new RegExp(`^\\s{0,${base+2}}`),''));i++;}
    const task=/^\[([ xX])\]\s+(.*)$/.exec(body);let prefix='';if(task){prefix=`<input type="checkbox" disabled${task[1]!==' '?' checked':''}> `;body=task[2];}
    items.push(`<li>${prefix}${inline(body,o)}${sub.length?renderMarkdown(sub.join('\n'),o):''}</li>`);}
   out.push(`<${ordered?'ol':'ul'}>${items.join('')}</${ordered?'ol':'ul'}>`);continue;}
  const buf=[line];i++;while(i<lines.length&&lines[i].trim()&&!blockStart(lines[i])&&!(lines[i].includes('|')&&i+1<lines.length&&isTableSep(lines[i+1]))){buf.push(lines[i]);i++;}
  out.push(`<p>${buf.map(l=>inline(l.trim(),o)).join('<br>')}</p>`);}
 return out.join('\n');}
