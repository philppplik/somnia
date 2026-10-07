/** Pure text conversions: CSV/TSV/JSON tables, plain text, Markdown/HTML helpers. No DOM needed. */
export function parseDelimited(text:string,delim:string):string[][]{
 const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;let any=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"'&&cell===''){quoted=true;any=true;continue;}
  if(c===delim){row.push(cell);cell='';any=true;continue;}
  if(c==='\r'){if(text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';any=false;continue;}
  if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';any=false;continue;}
  cell+=c;any=true;}
 if(quoted)throw Error('Unterminated quoted field');
 if(any||cell!==''||row.length){row.push(cell);rows.push(row);}
 return rows;}
export function formatDelimited(rows:readonly (readonly string[])[],delim:string):string{
 const q=(v:string)=>v.includes(delim)||/["\r\n]/.test(v)||/^\s|\s$/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
 return rows.map(r=>r.map(q).join(delim)).join('\r\n')+(rows.length?'\r\n':'');}
const cellText=(v:unknown):string=>v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
export function tableToJson(rows:string[][]):string{
 if(!rows.length)return '[]\n';
 const [head,...body]=rows;const seen=new Set<string>();
 const keys=head.map((h,i)=>{let k=h.trim()||`column_${i+1}`;let n=2;const base=k;while(seen.has(k))k=`${base}_${n++}`;seen.add(k);return k;});
 const objs=body.map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]??''])));
 return JSON.stringify(objs,null,2)+'\n';}
export function jsonToRows(text:string):string[][]{
 let data:unknown;try{data=JSON.parse(text);}catch(e){throw Error(`Invalid JSON: ${e instanceof Error?e.message:String(e)}`);}
 if(!Array.isArray(data))throw Error('JSON must be an array of objects or arrays to become a table');
 if(!data.length)return [];
 if(data.every(r=>Array.isArray(r)))return (data as unknown[][]).map(r=>r.map(cellText));
 if(data.every(r=>r!==null&&typeof r==='object'&&!Array.isArray(r))){
  const keys:string[]=[];for(const r of data as Record<string,unknown>[])for(const k of Object.keys(r))if(!keys.includes(k))keys.push(k);
  return [keys,...(data as Record<string,unknown>[]).map(r=>keys.map(k=>cellText(r[k])))];}
 throw Error('JSON array must contain only objects or only arrays');}
export const escapeHtml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function rowsToHtmlTable(rows:readonly (readonly string[])[],title:string):string{
 const [head,...body]=rows;
 const tr=(r:readonly string[],tag:string)=>`<tr>${r.map(c=>`<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`;
 return htmlDocument(title,`<table>\n${head?`<thead>${tr(head,'th')}</thead>\n`:''}<tbody>\n${body.map(r=>tr(r,'td')).join('\n')}\n</tbody>\n</table>`);}
export function htmlDocument(title:string,body:string):string{
 return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;}
/** Plain text to HTML: blank lines separate paragraphs, single line breaks become <br>. */
export function textToHtml(text:string,title:string):string{
 const paras=text.replace(/\r\n?/g,'\n').split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
 return htmlDocument(title,paras.map(p=>`<p>${escapeHtml(p).replace(/\n/g,'<br>\n')}</p>`).join('\n'));}
const ENT:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decodeEntities=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e:string)=>{if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);try{return String.fromCodePoint(n);}catch{return m;}}return ENT[e.toLowerCase()]??m;});
/** HTML to readable plain text. Scripts and styles are dropped; block elements become line breaks. */
export function htmlToText(html:string):string{
 let s=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|head|template)\b[\s\S]*?<\/\1\s*>/gi,'');
 s=s.replace(/<br\s*\/?>/gi,'\n').replace(/<li\b[^>]*>/gi,'\n- ').replace(/<\/(p|div|h[1-6]|tr|ul|ol|table|section|article|blockquote|pre)\s*>/gi,'\n\n').replace(/<\/t[dh]\s*>/gi,'\t');
 s=s.replace(/<[^>]+>/g,'');s=decodeEntities(s).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
 return s.trim()+'\n';}
