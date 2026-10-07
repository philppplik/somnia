/** Conversion formats: detection (magic bytes first, then extension, then content) and the source to target matrix. */
export type FormatId='md'|'html'|'txt'|'csv'|'tsv'|'json'|'svg'|'png'|'jpg'|'webp'|'gif'|'bmp'|'pdf'|'docx'|'unknown';
export interface FormatInfo{id:FormatId;ext:string;mime:string;label:string;kind:'text'|'image'|'binary'}
export const FORMATS:Readonly<Record<Exclude<FormatId,'unknown'>,FormatInfo>>={
 md:{id:'md',ext:'md',mime:'text/markdown;charset=utf-8',label:'Markdown',kind:'text'},
 html:{id:'html',ext:'html',mime:'text/html;charset=utf-8',label:'HTML',kind:'text'},
 txt:{id:'txt',ext:'txt',mime:'text/plain;charset=utf-8',label:'Plain text',kind:'text'},
 csv:{id:'csv',ext:'csv',mime:'text/csv;charset=utf-8',label:'CSV',kind:'text'},
 tsv:{id:'tsv',ext:'tsv',mime:'text/tab-separated-values;charset=utf-8',label:'TSV',kind:'text'},
 json:{id:'json',ext:'json',mime:'application/json;charset=utf-8',label:'JSON',kind:'text'},
 svg:{id:'svg',ext:'svg',mime:'image/svg+xml',label:'SVG',kind:'image'},
 png:{id:'png',ext:'png',mime:'image/png',label:'PNG',kind:'image'},
 jpg:{id:'jpg',ext:'jpg',mime:'image/jpeg',label:'JPEG',kind:'image'},
 webp:{id:'webp',ext:'webp',mime:'image/webp',label:'WebP',kind:'image'},
 gif:{id:'gif',ext:'gif',mime:'image/gif',label:'GIF',kind:'image'},
 bmp:{id:'bmp',ext:'bmp',mime:'image/bmp',label:'BMP',kind:'image'},
 pdf:{id:'pdf',ext:'pdf',mime:'application/pdf',label:'PDF',kind:'binary'},
 docx:{id:'docx',ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',label:'Word (DOCX)',kind:'binary'},
};
const RASTER_OUT:FormatId[]=['png','jpg','webp'];
/** Which targets each source can reach. Anything not listed is not convertible (no placeholders). */
export const TARGETS:Readonly<Record<FormatId,readonly FormatId[]>>={
 md:['html','txt','pdf'],html:['md','txt'],txt:['html','md'],csv:['json','tsv','html'],tsv:['csv','json'],json:['csv'],
 svg:RASTER_OUT,png:['jpg','webp'],jpg:['png','webp'],webp:['png','jpg'],gif:RASTER_OUT,bmp:RASTER_OUT,pdf:['txt','docx'],docx:['md'],unknown:[],
};
const EXT:Record<string,FormatId>={md:'md',markdown:'md',mdown:'md',html:'html',htm:'html',txt:'txt',text:'txt',csv:'csv',tsv:'tsv',tab:'tsv',json:'json',svg:'svg',png:'png',jpg:'jpg',jpeg:'jpg',jpe:'jpg',webp:'webp',gif:'gif',bmp:'bmp',pdf:'pdf',docx:'docx'};
export function extensionOf(name:string){const m=/\.([A-Za-z0-9]+)$/.exec(name);return m?m[1].toLowerCase():'';}
export function baseName(name:string){const leaf=name.split(/[\\/]/).pop()||name;return leaf.replace(/\.[^.]*$/,'')||'file';}
const startsWith=(b:Uint8Array,sig:number[],at=0)=>sig.every((v,i)=>b[at+i]===v);
/** Format by content signature, or undefined for text and unknown data. */
export function sniffBinary(b:Uint8Array):FormatId|undefined{
 if(b.length>=8&&startsWith(b,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'png';
 if(b.length>=3&&startsWith(b,[0xff,0xd8,0xff]))return 'jpg';
 if(b.length>=6&&(startsWith(b,[0x47,0x49,0x46,0x38,0x37,0x61])||startsWith(b,[0x47,0x49,0x46,0x38,0x39,0x61])))return 'gif';
 if(b.length>=12&&startsWith(b,[0x52,0x49,0x46,0x46])&&startsWith(b,[0x57,0x45,0x42,0x50],8))return 'webp';
 if(b.length>=2&&startsWith(b,[0x42,0x4d])&&b.length>=26)return 'bmp';
 if(b.length>=5&&startsWith(b,[0x25,0x50,0x44,0x46,0x2d]))return 'pdf';
 return undefined;}
function looksBinary(b:Uint8Array){const n=Math.min(b.length,4096);let bad=0;for(let i=0;i<n;i++){const c=b[i];if(c===0)return true;if(c<9||(c>13&&c<32&&c!==27))bad++;}return n>0&&bad/n>0.05;}
export function decodeUtf8(b:Uint8Array){
 if(b.length>=2&&b[0]===0xff&&b[1]===0xfe)return new TextDecoder('utf-16le').decode(b.subarray(2));
 if(b.length>=2&&b[0]===0xfe&&b[1]===0xff)return new TextDecoder('utf-16be').decode(b.subarray(2));
 const s=new TextDecoder('utf-8',{fatal:false}).decode(b);return s.charCodeAt(0)===0xfeff?s.slice(1):s;}
function sniffText(text:string):FormatId{
 const t=text.trimStart();const head=t.slice(0,2000).toLowerCase();
 if(head.startsWith('<svg')||(head.startsWith('<?xml')&&head.includes('<svg')))return 'svg';
 if(head.startsWith('<!doctype html')||head.startsWith('<html')||/<(body|head|div|p|h1|table)[\s>]/.test(head))return 'html';
 if(t.startsWith('{')||t.startsWith('[')){try{JSON.parse(text);return 'json';}catch{/* not json */}}
 const lines=text.split(/\r?\n/).filter(Boolean).slice(0,10);
 if(lines.length>1){const tabs=lines.map(l=>l.split('\t').length);if(tabs[0]>1&&tabs.every(n=>n===tabs[0]))return 'tsv';const commas=lines.map(l=>l.split(',').length);if(commas[0]>1&&commas.every(n=>n===commas[0]))return 'csv';}
 if(/^#{1,6}\s|^\s*[-*]\s|\]\(|^```/m.test(text))return 'md';
 return 'txt';}
/** Detect the source format. Content signatures beat the extension so a renamed file still converts correctly. */
export function detectFormat(name:string,bytes:Uint8Array):FormatId{
 const bin=sniffBinary(bytes);if(bin)return bin;
 if(extensionOf(name)==='docx'&&bytes.length>=4&&startsWith(bytes,[0x50,0x4b,0x03,0x04]))return 'docx';
 if(looksBinary(bytes))return 'unknown';
 const byExt=EXT[extensionOf(name)];
 // An extension that promises a binary format without its signature is a corrupt or mislabelled file.
 if(byExt&&['png','jpg','gif','webp','bmp','pdf','docx'].includes(byExt))return 'unknown';
 if(byExt)return byExt;
 return sniffText(decodeUtf8(bytes));}
/** Targets every file in the batch can reach. Empty when the batch has no common target. */
export function commonTargets(sources:readonly FormatId[]):FormatId[]{
 if(!sources.length)return [];
 const [first,...rest]=sources.map(s=>TARGETS[s]);return first.filter(t=>rest.every(r=>r.includes(t)));}
/** Every target reachable by at least one file. Used to show an honest picker when the batch is mixed. */
export function anyTargets(sources:readonly FormatId[]):FormatId[]{const out=new Set<FormatId>();for(const s of sources)for(const t of TARGETS[s])out.add(t);return [...out];}
export function formatLabel(id:FormatId){return id==='unknown'?'Unknown':FORMATS[id].label;}
