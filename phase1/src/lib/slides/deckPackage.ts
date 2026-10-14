/**
 * Slides authoring model (P0 spike): stable ids and targeted OOXML part patching.
 *
 * Reads a PPTX package into slides (p:sldId id), shapes (p:cNvPr id) and text runs without
 * rewriting anything. Mutations patch only the parts they own (today: ppt/presentation.xml)
 * and keep every other part's bytes. Anything the model cannot prove it understands makes the
 * operation throw instead of guessing; unsupported content is never rewritten.
 *
 * Limits, stated plainly:
 * - The XML scanner is a tag tokenizer, not a validating parser. It understands the
 *   canonical shapes PowerPoint, LibreOffice, Google Slides and DeckCraft write. Other
 *   structure raises a "problems" entry and disables editing for that slide.
 * - Run ordinals match the legacy `readRuns` order so existing edits keep working; this
 *   module refuses to expose a slide whose ordinals disagree with it.
 * - docProps/app.xml slide-title metadata is derived data and is left as written.
 */
import {unzipSync,zipSync,strFromU8,strToU8,type Zippable} from 'fflate';
import {listZip} from '../office/zipProbe';

export type ShapeKind='text'|'picture'|'table'|'chart'|'group'|'connector'|'other';
export interface ShapeRef {id:number;name:string;kind:ShapeKind;runCount:number}
export interface SlideModel {id:number;rid:string;part:string;shapes:ShapeRef[];problems:string[]}
export interface ModelRun {slideId:number;shapeId:number;paragraph:number;run:number;ordinal:number;text:string;key:string}
export interface SectionInfo {name:string;ids:number[]}
export interface DeckModel {slides:SlideModel[];runs:ModelRun[];sections:SectionInfo[]|null}

export const MAX_SLIDES=200;
const MAX_ENTRY=16*1024*1024;
const MAX_ENTRIES=2048;
const SLD_MIN=256,SLD_MAX=2147483647;
const dec=(s:string)=>s.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(amp|lt|gt|quot|apos);/gi,(_,h,d,n)=>h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(parseInt(d,10)):(({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[String(n).toLowerCase()]??_));
const attr=(tag:string,name:string)=>new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Safe package read: bounded, no encrypted/signed/duplicate entries. */
export function openPackage(bytes:Uint8Array):Record<string,Uint8Array>{
  const entries=listZip(bytes);
  if(entries.length>MAX_ENTRIES||entries.some(e=>e.encrypted||e.size>MAX_ENTRY))throw Error('Unsupported or oversized PPTX package');
  if(entries.some(e=>e.name.startsWith('_xmlsignatures/')))throw Error('Digitally signed PPTX editing is not supported');
  const names=new Set<string>();
  for(const e of entries){const n=e.name.replace(/\\/g,'/').toLowerCase();if(names.has(n)||n.startsWith('/')||n.split('/').includes('..'))throw Error('Ambiguous ZIP path in PPTX');names.add(n);}
  return unzipSync(bytes);
}
const text=(zip:Record<string,Uint8Array>,name:string)=>zip[name]?strFromU8(zip[name]):'';
const target=(t:string)=>t.startsWith('/')?t.slice(1):'ppt/'+t.replace(/^\.\//,'');

interface SldIdTag {id:number;rid:string;raw:string}
const SLD_LIST=/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/g;
const SLD_ID=/<p:sldId\b([^>]*?)(?:\/>|>\s*<\/p:sldId>)/g;
function slideList(xml:string):{start:number;end:number;items:SldIdTag[]}{
  const lists=[...xml.matchAll(SLD_LIST)];
  if(lists.length!==1)throw Error('Presentation must contain exactly one canonical slide list');
  const m=lists[0],inner=m[1],items:SldIdTag[]=[];
  const rest=inner.replace(SLD_ID,(raw,a:string)=>{
    const id=Number(attr(' '+a,'id')),rid=attr(' '+a,'r:id');
    if(!Number.isInteger(id)||id<SLD_MIN||id>SLD_MAX||!rid)throw Error('Slide list has an invalid slide id');
    items.push({id,rid,raw});return '';
  });
  if(rest.trim()!=='')throw Error('Slide list contains unsupported content');
  if(!items.length||items.length>MAX_SLIDES)throw Error(`Expected 1-${MAX_SLIDES} slides`);
  if(new Set(items.map(i=>i.id)).size!==items.length||new Set(items.map(i=>i.rid)).size!==items.length)throw Error('Slide list has duplicate ids');
  const start=m.index!+'<p:sldIdLst>'.length;return {start,end:start+inner.length,items};
}
function sections(xml:string):{block:string;index:number;items:{name:string;ids:number[];raw:string;inner:string;list:string}[]}|null{
  const m=/<p14:sectionLst\b[^>]*>([\s\S]*?)<\/p14:sectionLst>/.exec(xml);if(!m)return null;
  const items:{name:string;ids:number[];raw:string;inner:string;list:string}[]=[];
  for(const s of m[1].matchAll(/<p14:section\b([^>]*)>([\s\S]*?)<\/p14:section>/g)){
    const l=/<p14:sldIdLst>([\s\S]*?)<\/p14:sldIdLst>/.exec(s[2]);
    const ids=l?[...l[1].matchAll(/<p14:sldId\b[^>]*\sid="(\d+)"[^>]*\/>/g)].map(x=>Number(x[1])):[];
    items.push({name:dec(attr(s[1],'name')??''),ids,raw:s[0],inner:s[2],list:l?l[0]:''});
  }
  return {block:m[0],index:m.index!,items};
}

const SHAPE_TAGS:Record<string,ShapeKind>={'p:sp':'text','p:pic':'picture','p:graphicFrame':'table','p:grpSp':'group','p:cxnSp':'connector'};
const TAG=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
/** Tokenizes one slide part into top-level shapes and text runs with stable ids. */
export function readSlidePart(xml:string,slideId:number):{shapes:ShapeRef[];runs:ModelRun[];problems:string[]}{
  const shapes:ShapeRef[]=[],runs:ModelRun[]=[],problems:string[]=[];
  const stack:{tag:string;shape?:ShapeRef}[]=[];
  let para=-1,run=-1,ordinal=0,open:{start:number;shape?:ShapeRef;para:number;run:number}|null=null;
  for(const m of xml.matchAll(TAG)){
    if(m[2]===undefined)continue;
    const closing=m[1]==='/',tag=m[2],self=m[4]==='/';
    if(closing){
      if(tag==='a:t'&&open){const t=dec(xml.slice(open.start,m.index));const shape=open.shape;
        if(shape){shape.runCount++;runs.push({slideId,shapeId:shape.id,paragraph:open.para,run:open.run,ordinal:ordinal,text:t,key:`${slideId}:${shape.id}:${open.para}:${open.run}`});}
        else problems.push('Text outside a shape');
        ordinal++;open=null;}
      const top=stack.pop();if(!top||top.tag!==tag){problems.push('Malformed slide XML');break;}
      continue;
    }
    const parent=stack.at(-1);
    const enclosing=[...stack].reverse().find(s=>s.shape)?.shape;
    if(SHAPE_TAGS[tag]&&parent&&(parent.tag==='p:spTree'||parent.tag==='p:grpSp')){
      const shape:ShapeRef={id:-1,name:'',kind:tag==='p:sp'?'other':SHAPE_TAGS[tag]==='table'?'other':SHAPE_TAGS[tag],runCount:0};
      shapes.push(shape);
      if(self){problems.push('Empty shape element');continue;}
      stack.push({tag,shape});continue;
    }
    if(tag==='p:cNvPr'&&stack.length>=2){
      const owner=stack[stack.length-2]?.shape;
      if(owner&&stack.at(-1)!.tag.startsWith('p:nv')){owner.id=Number(attr(m[3],'id'));owner.name=dec(attr(m[3],'name')??'');}
    }
    if(tag==='a:tbl'&&enclosing)enclosing.kind='table';
    if(tag==='c:chart'&&enclosing)enclosing.kind='chart';
    if(tag==='a:p'){para++;run=-1;}
    if(tag==='a:r'||tag==='a:fld'){run++;}
    if(tag==='a:t'&&!self)open={start:m.index!+m[0].length,shape:enclosing,para:Math.max(para,0),run:Math.max(run,0)};
    if(!self)stack.push({tag});
    if(tag==='p:txBody'&&enclosing){para=-1;if(enclosing.kind==='other')enclosing.kind='text';}
  }
  if(stack.length)problems.push('Unclosed slide XML');
  // Shape ids must be unique positive integers for stable addressing.
  const ids=shapes.map(s=>s.id);
  if(ids.some(i=>!Number.isInteger(i)||i<0))problems.push('Shape without a numeric id');
  if(new Set(ids).size!==ids.length)problems.push('Duplicate shape ids');
  const legacy=[...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>dec(m[1]));
  if(legacy.length!==ordinal||legacy.some((t,i)=>t!==runs[i]?.text))problems.push('Text run order differs from the canonical reader');
  return {shapes,runs,problems};
}

/** Reads slides, shapes and runs. Slides with problems keep `problems` and contribute no runs. */
export function readDeckModel(bytes:Uint8Array):DeckModel{
  const zip=openPackage(bytes);
  const pres=text(zip,'ppt/presentation.xml');if(!pres)throw Error('Missing presentation part');
  const list=slideList(pres);
  const rels=new Map<string,string>();
  for(const m of text(zip,'ppt/_rels/presentation.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)){
    const id=attr(m[1],'Id'),t=attr(m[1],'Target');if(id&&t&&!/TargetMode="External"/.test(m[1]))rels.set(id,target(t));
  }
  const slides:SlideModel[]=[],runs:ModelRun[]=[],parts=new Set<string>();
  for(const item of list.items){
    const part=rels.get(item.rid);
    if(!part||!/^ppt\/slides\/slide\d+\.xml$/.test(part)||!zip[part])throw Error('Slide list needs canonical internal slide relationships');
    if(parts.has(part))throw Error('Two slides share one slide part');parts.add(part);
    const r=readSlidePart(strFromU8(zip[part]),item.id);
    slides.push({id:item.id,rid:item.rid,part,shapes:r.shapes,problems:r.problems});
    if(!r.problems.length)runs.push(...r.runs);
  }
  const s=sections(pres);
  return {slides,runs,sections:s?s.items.map(i=>({name:i.name,ids:i.ids})):null};
}

const MEDIA=/\.(png|jpe?g|gif|webp|mp4|m4a|mp3|wmv|zip|docx|xlsx|pptx)$/i;
function repack(zip:Record<string,Uint8Array>,changed:Record<string,string>):Uint8Array{
  const out:Zippable={};
  for(const [name,data] of Object.entries(zip)){
    const next=name in changed?strToU8(changed[name]):data;
    out[name]=[next,{level:name in changed||!MEDIA.test(name)?6:0,mtime:new Date(1980,0,1)}];
  }
  return zipSync(out);
}

/**
 * Moves one slide to `toIndex` (0-based, in the resulting order) by rewriting only the slide
 * order in ppt/presentation.xml (slide list and, when present, section member lists).
 * Slide parts, relationships, content types and media are untouched.
 */
export function moveSlide(bytes:Uint8Array,slideId:number,toIndex:number):Uint8Array{
  const zip=openPackage(bytes),pres=text(zip,'ppt/presentation.xml');
  const model=readDeckModel(bytes);
  const list=slideList(pres),n=list.items.length;
  const from=list.items.findIndex(i=>i.id===slideId);
  if(from<0)throw Error('Slide no longer exists');
  if(!Number.isInteger(toIndex)||toIndex<0||toIndex>=n)throw Error('Target position is out of range');
  if(from===toIndex)return bytes;
  const order=list.items.map(i=>i.id);order.splice(toIndex,0,order.splice(from,1)[0]);
  return applyOrder(bytes,zip,pres,list,model,order);
}
/** Applies a full permutation of the current slide ids. */
export function reorderSlides(bytes:Uint8Array,order:readonly number[]):Uint8Array{
  const zip=openPackage(bytes),pres=text(zip,'ppt/presentation.xml'),model=readDeckModel(bytes),list=slideList(pres);
  const current=list.items.map(i=>i.id);
  if(order.length!==current.length||new Set(order).size!==order.length||order.some(i=>!current.includes(i)))throw Error('Order is not a permutation of the current slides');
  if(order.every((id,i)=>id===current[i]))return bytes;
  return applyOrder(bytes,zip,pres,list,model,[...order]);
}
function applyOrder(_bytes:Uint8Array,zip:Record<string,Uint8Array>,pres:string,list:ReturnType<typeof slideList>,before:DeckModel,order:number[]):Uint8Array{
  const byId=new Map(list.items.map(i=>[i.id,i.raw]));
  let xml=pres.slice(0,list.start)+order.map(id=>byId.get(id)!).join('')+pres.slice(list.end);
  const sec=sections(pres);
  if(sec){
    const pos=new Map(order.map((id,i)=>[id,i]));
    const rebuilt=sec.items.map(s=>[...s.ids].sort((a,b)=>pos.get(a)!-pos.get(b)!));
    if(rebuilt.flat().join()!==order.join())throw Error('This move would cross a section boundary. Move the slide within its section.');
    let block=sec.block;
    sec.items.forEach((s,i)=>{
      if(!s.list)return;
      const items=new Map([...s.list.matchAll(/<p14:sldId\b[^>]*\sid="(\d+)"[^>]*\/>/g)].map(x=>[Number(x[1]),x[0]]));
      const nl='<p14:sldIdLst>'+rebuilt[i].map(id=>items.get(id)!).join('')+'</p14:sldIdLst>';
      block=block.replace(s.raw,s.raw.replace(s.list,nl));
    });
    xml=xml.replace(sec.block,block);
  }
  const out=repack(zip,{'ppt/presentation.xml':xml});
  // Post-condition: reopen, same slides in the requested order, every other part byte-equal.
  const after=readDeckModel(out);
  if(after.slides.map(s=>s.id).join()!==order.join())throw Error('Reordered deck failed verification');
  const reopened=unzipSync(out);
  for(const name of Object.keys(zip))if(name!=='ppt/presentation.xml'&&(!reopened[name]||reopened[name].length!==zip[name].length||reopened[name].some((v,i)=>v!==zip[name][i])))throw Error('Reordered deck changed an unrelated part');
  if(after.runs.length!==before.runs.length)throw Error('Reordered deck failed verification');
  return out;
}
