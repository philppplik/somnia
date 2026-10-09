import {unzipSync,strFromU8} from 'fflate';
import {readRuns,makeEditedCopy} from './editCopy';
import {listZip} from '../office/zipProbe';
import type {DeckSummary} from './protocol';
export interface DeckDocument {version:1;widthPt:number;heightPt:number;layouts:string[];slides:{index:number;layout:string|null;texts:{run:number;text:string}[];notes:string[]}[]}
export const MAX_DECK_JSON=1024*1024;
const object=(v:unknown,keys:string[],required=keys):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected a deck object.');const o=v as Record<string,unknown>;if(Object.keys(o).some(k=>!keys.includes(k)))throw Error('Unknown deck key.');if(required.some(k=>!Object.hasOwn(o,k)))throw Error('Missing deck key.');return o;};
const number=(v:unknown,lo:number,hi:number,integer=false):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||(integer&&!Number.isSafeInteger(v)))throw Error('Deck value outside range.');return v;};
const text=(v:unknown):string=>{if(typeof v!=='string'||new TextEncoder().encode(v).length>16384||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))throw Error('Invalid deck text (16 KiB limit).');return v;};
const list=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v)||v.length>max)throw Error('Invalid deck list.');return v;};
const layout=(v:unknown):string=>{if(typeof v!=='string'||!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(v))throw Error('Unknown deck layout.');return v;};
/** Full metadata/text document only. No bytes, URLs, embedded assets or arbitrary XML fields. */
export function parseDeck(input:string):DeckDocument {
 if(new TextEncoder().encode(input).length>MAX_DECK_JSON)throw Error('Deck JSON exceeds 1 MiB.');let raw:unknown;try{raw=JSON.parse(input);}catch{throw Error('Deck is not valid JSON.');}
 const o=object(raw,['version','widthPt','heightPt','layouts','slides']);if(o.version!==1)throw Error('Unknown deck version.');
 const layouts=list(o.layouts,2048).map(layout);if(new Set(layouts).size!==layouts.length)throw Error('Duplicate deck layout.');
 const slides=list(o.slides,2048).map((v,index)=>{const s=object(v,['index','layout','texts','notes']);if(s.index!==index)throw Error('Slide index outside range or out of order.');if(s.layout!==null&&!layouts.includes(layout(s.layout)))throw Error('Unknown deck layout.');const texts=list(s.texts,16384).map((v,run)=>{const t=object(v,['run','text']);if(t.run!==run)throw Error('Text run outside range or out of order.');return {run,text:text(t.text)};});return {index,layout:s.layout as string|null,texts,notes:list(s.notes,16384).map(text)};});
 if(!slides.length)throw Error('Deck needs slides.');return {version:1,widthPt:number(o.widthPt,1,100000),heightPt:number(o.heightPt,1,100000),layouts,slides};
}
export const serializeDeck=(doc:DeckDocument)=>JSON.stringify(parseDeck(JSON.stringify(doc)),null,1);
const decode=(s:string)=>s.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(amp|lt|gt|quot|apos);/gi,(_,h,d,n)=>h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(parseInt(d,10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[String(n).toLowerCase()]??_);
/** Canonical OOXML extraction. Notes are read-only. No external relationship is dereferenced. */
export function readDeckDocument(bytes:Uint8Array,summary:DeckSummary):DeckDocument {
 const entries=listZip(bytes);if(entries.length>2048||entries.some(e=>e.encrypted||e.size>16*1024*1024))throw Error('Deck intake exceeds budget.');
 const zip=unzipSync(bytes),runs=readRuns(bytes),layouts=Object.keys(zip).filter(n=>/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).sort();
 const rels=strFromU8(zip['ppt/_rels/presentation.xml.rels']??new Uint8Array()),presentation=strFromU8(zip['ppt/presentation.xml']??new Uint8Array());
 const targets=new Map<string,string>();for(const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)){const id=/\bId="([^"]+)"/.exec(m[1])?.[1],target=/\bTarget="([^"]+)"/.exec(m[1])?.[1];if(id&&target&&!/TargetMode="External"/.test(m[1]))targets.set(id,target.startsWith('/')?target.slice(1):'ppt/'+target);}
 const parts=[...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"[^>]*\/?>/g)].map(m=>targets.get(m[1])!);
 const slides=parts.map((part,index)=>{const rel=strFromU8(zip[part.replace('/slides/','/slides/_rels/')+'.rels']??new Uint8Array());let foundLayout:string|null=null,notes:string[]=[];
  for(const m of rel.matchAll(/<Relationship\b([^>]*)\/?>/g)){if(/TargetMode="External"/.test(m[1]))continue;const type=/\bType="([^"]+)"/.exec(m[1])?.[1],target=/\bTarget="([^"]+)"/.exec(m[1])?.[1];if(!target)continue;
   if(type?.endsWith('/slideLayout')){const n=target.startsWith('/')?target.slice(1):/^\.\.\/slideLayouts\//.test(target)?'ppt/'+target.slice(3):'';if(layouts.includes(n))foundLayout=n;}
   if(type?.endsWith('/notesSlide')){const n=target.startsWith('/')?target.slice(1):/^\.\.\/notesSlides\//.test(target)?'ppt/'+target.slice(3):'';if(/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)&&zip[n])notes=[...strFromU8(zip[n]).matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>decode(m[1]));}
  }
  return {index,layout:foundLayout,texts:runs.filter(r=>r.slide===index).map(r=>({run:r.run,text:r.text})),notes};});
 if(slides.length!==summary.slides)throw Error('Noncanonical slide metadata is preview-only.');return parseDeck(JSON.stringify({version:1,widthPt:summary.widthPt,heightPt:summary.heightPt,layouts,slides}));
}
/** Partial requests have only changes[{slide,run,text}]. Layout/notes mutation isn't implemented. */
export function proposeDeck(before:DeckDocument,raw:unknown):DeckDocument {
 const o=object(raw,['changes']),changes=list(o.changes,100);if(!changes.length)throw Error('Proposal makes no change.');const after=structuredClone(before),seen=new Set<string>();
 for(const v of changes){const c=object(v,['slide','run','text']);const slide=number(c.slide,0,before.slides.length-1,true),run=number(c.run,0,(before.slides[slide]?.texts.length??0)-1,true),key=`${slide}:${run}`;if(seen.has(key))throw Error('Duplicate deck change.');seen.add(key);after.slides[slide].texts[run].text=text(c.text);}
 if(serializeDeck(before)===serializeDeck(after))throw Error('Proposal makes no change.');return parseDeck(JSON.stringify(after));
}
export function deckTextEdits(before:DeckDocument,after:DeckDocument,bytes:Uint8Array){
 const withoutText=(d:DeckDocument)=>({...d,slides:d.slides.map(s=>({...s,texts:s.texts.map(t=>({run:t.run}))}))});
 if(JSON.stringify(withoutText(before))!==JSON.stringify(withoutText(after)))throw Error('Layouts, notes, dimensions and slide/run structure are read-only.');
 const runs=readRuns(bytes);return runs.filter(r=>before.slides[r.slide].texts[r.run].text!==after.slides[r.slide].texts[r.run].text).map(r=>({...r,old:r.text,text:after.slides[r.slide].texts[r.run].text}));
}
export function editedDeckBytes(bytes:Uint8Array,summary:DeckSummary,after:DeckDocument){const edits=deckTextEdits(readDeckDocument(bytes,summary),after,bytes);if(!edits.length)throw Error('Proposal makes no change.');return makeEditedCopy(bytes,edits);}
