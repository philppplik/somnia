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
import {sniffImage} from './imageSniff';

export type ShapeKind='text'|'picture'|'table'|'chart'|'group'|'connector'|'other';
/** Stored geometry in EMU. `source` says where it came from; only `slide` bounds are the shape's own. */
export interface ShapeBounds {x:number;y:number;w:number;h:number;rot:number;flipH:boolean;flipV:boolean;source:'slide'|'layout'|'master'}
export interface ShapePlaceholder {type:string;idx:string}
/** Explicit run formatting shared by every run of a shape; null when mixed, inherited or absent. */
export interface ShapeFormat {bold:boolean|null;italic:boolean|null;sizePt:number|null;color:string|null}
export interface ShapeRef {id:number;name:string;kind:ShapeKind;runCount:number;parentId:number|null;bounds:ShapeBounds|null;ph:ShapePlaceholder|null;fmt?:ShapeFormat}
export interface SlideModel {id:number;rid:string;part:string;shapes:ShapeRef[];problems:string[]}
export interface ModelRun {slideId:number;shapeId:number;paragraph:number;run:number;ordinal:number;text:string;key:string}
export interface SectionInfo {name:string;ids:number[]}
export interface DeckModel {slides:SlideModel[];runs:ModelRun[];sections:SectionInfo[]|null;layouts?:LayoutInfo[];slideSize:{cx:number;cy:number}|null}

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
  const runFmt=new Map<ShapeRef,{b?:string;i?:string;sz?:string;u?:string;c?:string;skip?:boolean}[]>();
  const stack:{tag:string;shape?:ShapeRef;xf?:{owner:ShapeRef}}[]=[];const parentOf=new Map<ShapeRef,ShapeRef|undefined>();
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
      const shape:ShapeRef={id:-1,name:'',kind:tag==='p:sp'?'other':SHAPE_TAGS[tag]==='table'?'other':SHAPE_TAGS[tag],runCount:0,parentId:null,bounds:null,ph:null};
      parentOf.set(shape,parent.tag==='p:grpSp'?parent.shape:undefined);
      shapes.push(shape);
      if(self){problems.push('Empty shape element');continue;}
      stack.push({tag,shape});continue;
    }
    if(tag==='p:cNvPr'&&stack.length>=2){
      const owner=stack[stack.length-2]?.shape;
      if(owner&&stack.at(-1)!.tag.startsWith('p:nv')){owner.id=Number(attr(m[3],'id'));owner.name=dec(attr(m[3],'name')??'');}
    }
    if(tag==='p:ph'&&enclosing&&parent?.tag==='p:nvPr')enclosing.ph={type:attr(m[3],'type')??'',idx:attr(m[3],'idx')??''};
    if((tag==='a:xfrm'||tag==='p:xfrm')&&enclosing&&!self&&(parent?.tag==='p:spPr'||parent?.tag==='p:grpSpPr'||parent?.tag==='p:graphicFrame')&&!enclosing.bounds){
      const rot=Number(attr(m[3],'rot')??0);
      enclosing.bounds={x:NaN,y:NaN,w:NaN,h:NaN,rot:Number.isFinite(rot)?rot:NaN,flipH:attr(m[3],'flipH')==='1'||attr(m[3],'flipH')==='true',flipV:attr(m[3],'flipV')==='1'||attr(m[3],'flipV')==='true',source:'slide'};
      stack.push({tag,xf:{owner:enclosing}});continue;
    }
    if((tag==='a:off'||tag==='a:ext')&&parent?.xf){const b=parent.xf.owner.bounds;
      if(b){if(tag==='a:off'){b.x=Number(attr(m[3],'x'));b.y=Number(attr(m[3],'y'));}else{b.w=Number(attr(m[3],'cx'));b.h=Number(attr(m[3],'cy'));}}}
    if(tag==='a:tbl'&&enclosing)enclosing.kind='table';
    if(tag==='c:chart'&&enclosing)enclosing.kind='chart';
    if(tag==='a:r'||tag==='a:fld'){if(enclosing){const l=runFmt.get(enclosing)??[];l.push(tag==='a:r'?{}:{skip:true});runFmt.set(enclosing,l);}}
    if(tag==='a:rPr'&&enclosing&&parent?.tag==='a:r'){const r=runFmt.get(enclosing)?.at(-1);if(r){r.b=attr(m[3],'b');r.i=attr(m[3],'i');r.sz=attr(m[3],'sz');r.u=attr(m[3],'u');}}
    if(tag==='a:srgbClr'&&enclosing&&parent?.tag==='a:solidFill'&&stack.at(-2)?.tag==='a:rPr'&&stack.at(-3)?.tag==='a:r'){const r=runFmt.get(enclosing)?.at(-1);if(r)r.c=attr(m[3],'val');}
    if(tag==='a:p'){para++;run=-1;}
    if(tag==='a:r'||tag==='a:fld'){run++;}
    if(tag==='a:t'&&!self)open={start:m.index!+m[0].length,shape:enclosing,para:Math.max(para,0),run:Math.max(run,0)};
    if(!self)stack.push({tag});
    if(tag==='p:txBody'&&enclosing){para=-1;if(enclosing.kind==='other')enclosing.kind='text';}
  }
  if(stack.length)problems.push('Unclosed slide XML');
  const BIG=1e10;
  for(const sh of shapes){
    const par=parentOf.get(sh);sh.parentId=par?par.id:null;
    const b=sh.bounds;
    // Nested shapes live in group child space; only top-level shapes expose usable bounds.
    if(b&&(par||![b.x,b.y,b.w,b.h,b.rot].every(Number.isFinite)||b.w<0||b.h<0||[b.x,b.y,b.w,b.h].some(v=>Math.abs(v)>BIG)||!Number.isInteger(b.x)||!Number.isInteger(b.y)||!Number.isInteger(b.w)||!Number.isInteger(b.h)))sh.bounds=null;
  }
  const same=<T,>(v:(T|undefined|null)[]):T|null=>v.length&&v.every(x=>x!=null&&x===v[0])?v[0]!:null;
  for(const [sh,list] of runFmt){if(!list.length)continue;
    const ok=list.every(r=>!r.skip),flag=(k:'b'|'i')=>ok?same(list.map(r=>r[k]==='1'||r[k]==='true'?true:r[k]==='0'||r[k]==='false'?false:null)):null;
    const sz=ok?same(list.map(r=>r.sz&&/^\d+$/.test(r.sz)?Number(r.sz):null)):null,c=ok?same(list.map(r=>r.c&&/^[0-9A-Fa-f]{6}$/.test(r.c)?r.c.toUpperCase():null)):null;
    sh.fmt={bold:flag('b'),italic:flag('i'),sizePt:sz!==null?sz/100:null,color:c};}
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
    inheritBounds(zip,part,r.shapes);
    slides.push({id:item.id,rid:item.rid,part,shapes:r.shapes,problems:r.problems});
    if(!r.problems.length)runs.push(...r.runs);
  }
  const s=sections(pres);
  const sz=/<p:sldSz\b([^>]*)\/?>/.exec(pres),cx=Number(attr(sz?.[1]??'','cx')),cy=Number(attr(sz?.[1]??'','cy'));
  return {slides,runs,sections:s?s.items.map(i=>({name:i.name,ids:i.ids})):null,slideSize:sz&&Number.isInteger(cx)&&Number.isInteger(cy)&&cx>0&&cy>0&&cx<1e10&&cy<1e10?{cx,cy}:null};
}

const PH_ALIAS:Record<string,string>={ctrTitle:'title',subTitle:'body',obj:'body','':'body'};
const phKey=(t:string)=>PH_ALIAS[t]??t;
/** Placeholders without their own xfrm inherit position from the layout, then the master. Display-only (`source` says so). */
function inheritBounds(zip:Record<string,Uint8Array>,slidePart:string,shapes:ShapeRef[]){
  if(!shapes.some(s=>!s.bounds&&s.ph&&s.parentId===null))return;
  const chain:{part:string;source:'layout'|'master'}[]=[];
  try{
    const layout=readRels(zip,slidePart).find(r=>r.type===RT+'slideLayout'&&!r.external);if(!layout)return;
    const lp=resolve(slidePart,layout.target);chain.push({part:lp,source:'layout'});
    const master=readRels(zip,lp).find(r=>r.type===RT+'slideMaster'&&!r.external);if(master)chain.push({part:resolve(lp,master.target),source:'master'});
  }catch{return;}
  const parsed=chain.filter(c=>zip[c.part]).map(c=>({source:c.source,shapes:readSlidePart(strFromU8(zip[c.part]),0).shapes.filter(x=>x.ph&&x.bounds&&x.parentId===null)}));
  for(const sh of shapes){
    const ph=sh.ph;if(sh.bounds||!ph||sh.parentId!==null)continue;
    for(const p of parsed){
      const hit=(ph.idx!==''?p.shapes.find(x=>x.ph!.idx===ph.idx&&phKey(x.ph!.type)===phKey(ph.type)):undefined)??p.shapes.find(x=>phKey(x.ph!.type)===phKey(ph.type)&&(ph.idx===''||x.ph!.idx===''||p.source==='master'));
      if(hit?.bounds){sh.bounds={...hit.bounds,source:p.source};break;}
    }
  }
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

/* ---------------------------------------------------------------------------------------
 * P1: duplicate, delete and new-from-layout. All three patch parts in place and verify the
 * result by reopening it. Anything with a relationship type we cannot copy or clean up
 * safely is refused instead of approximated.
 * ------------------------------------------------------------------------------------- */
const RT='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const CT_SLIDE='application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const CT_NOTES='application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml';
interface Rel {id:string;type:string;target:string;external:boolean;raw:string}
const relsName=(part:string)=>part.replace(/([^/]+)$/,'_rels/$1.rels');
function readRels(zip:Record<string,Uint8Array>,part:string):Rel[]{
  return [...text(zip,relsName(part)).matchAll(/<Relationship\b([^>]*?)\/?>/g)].map(m=>({id:attr(m[1],'Id')??'',type:attr(m[1],'Type')??'',target:attr(m[1],'Target')??'',external:/TargetMode="External"/.test(m[1]),raw:m[0]}));
}
/** Resolves a relationship target against its source part, rejecting anything outside the package. */
function resolve(part:string,target:string):string{
  if(/^[a-z][a-z0-9+.-]*:/i.test(target))throw Error('Unsupported relationship target');
  const segs=(target.startsWith('/')?target.slice(1):part.replace(/[^/]*$/,'')+target).split('/'),out:string[]=[];
  for(const s of segs){if(s===''||s==='.')continue;if(s==='..'){if(!out.length)throw Error('Relationship escapes the package');out.pop();}else out.push(s);}
  return out.join('/');
}
const relative=(from:string,to:string)=>{const a=from.split('/').slice(0,-1),b=to.split('/');while(a.length&&b.length>1&&a[0]===b[0]){a.shift();b.shift();}return '../'.repeat(a.length)+b.join('/');};
const nextFree=(zip:Record<string,Uint8Array>,dir:string,stem:string,ext:string)=>{for(let n=1;n<100000;n++){const p=`${dir}/${stem}${n}.${ext}`;if(!zip[p])return p;}throw Error('No free part name');};
const lower=(zip:Record<string,Uint8Array>)=>new Set(Object.keys(zip).map(k=>k.toLowerCase()));
function addOverride(types:string,part:string,ct:string){return types.replace('</Types>',`<Override PartName="/${part}" ContentType="${ct}"/></Types>`);}
function hasOverride(types:string,part:string,ct?:string){const m=new RegExp(`<Override\\b[^>]*\\sPartName="/${part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*/?>`).exec(types);return !!m&&(!ct||m[0].includes(`ContentType="${ct}"`));}
function dropOverride(types:string,part:string){return types.replace(new RegExp(`<Override\\b[^>]*\\sPartName="/${part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*/>`),'');}
function relId(rels:string,xml:string){let n=0;for(const m of (rels+xml).matchAll(/Id="rId(\d+)"|r:id="rId(\d+)"/g))n=Math.max(n,Number(m[1]??m[2]));return `rId${n+1}`;}

interface Ctx {zip:Record<string,Uint8Array>;pres:string;presRels:string;types:string;list:ReturnType<typeof slideList>;slidePart:Map<number,{part:string;rid:string}>}
function context(bytes:Uint8Array):Ctx{
  const zip=openPackage(bytes);const model=readDeckModel(bytes);
  const pres=text(zip,'ppt/presentation.xml'),list=slideList(pres);
  return {zip,pres,presRels:text(zip,'ppt/_rels/presentation.xml.rels'),types:text(zip,'[Content_Types].xml'),list,slidePart:new Map(model.slides.map(s=>[s.id,{part:s.part,rid:s.rid}]))};
}
/** Inserts a slide id after `afterId` in the slide list and in the same section (if any). */
function insertSlideId(c:Ctx,id:number,rid:string,afterId:number|null):string{
  const items=c.list.items,at=afterId===null?items.length:items.findIndex(i=>i.id===afterId)+1;
  if(afterId!==null&&at===0)throw Error('Slide no longer exists');
  let pres=c.pres.slice(0,c.list.start)+[...items.slice(0,at).map(i=>i.raw),`<p:sldId id="${id}" r:id="${rid}"/>`,...items.slice(at).map(i=>i.raw)].join('')+c.pres.slice(c.list.end);
  const sec=sections(c.pres);
  if(sec){
    const target=afterId===null?sec.items.length-1:sec.items.findIndex(s=>s.ids.includes(afterId));
    if(target<0||!sec.items[target].list)throw Error('Slide section could not be located');
    const s=sec.items[target];const els=[...s.list.matchAll(/<p14:sldId\b[^>]*\sid="(\d+)"[^>]*\/>/g)];
    const pos=afterId===null?els.length:els.findIndex(e=>Number(e[1])===afterId)+1;
    const nl='<p14:sldIdLst>'+[...els.slice(0,pos).map(e=>e[0]),`<p14:sldId id="${id}"/>`,...els.slice(pos).map(e=>e[0])].join('')+'</p14:sldIdLst>';
    pres=pres.replace(sec.block,sec.block.replace(s.raw,s.raw.replace(s.list,nl)));
  }
  return pres;
}
const newSlideId=(c:Ctx)=>{const id=Math.max(...c.list.items.map(i=>i.id))+1;if(id>SLD_MAX)throw Error('No free slide id');return id;};
function finish(c:Ctx,changed:Record<string,string>,add:Record<string,Uint8Array>,remove:string[],check:(after:DeckModel)=>void):Uint8Array{
  const next:Record<string,Uint8Array>={};
  for(const [k,v] of Object.entries(c.zip))if(!remove.includes(k))next[k]=v;
  for(const [k,v] of Object.entries(add))next[k]=v;
  const out=repack(next,changed);
  const after=readDeckModel(out);check(after);
  const reopened=unzipSync(out);
  for(const k of Object.keys(next))if(!(k in changed)&&!(k in add)&&(!reopened[k]||reopened[k].length!==next[k].length||reopened[k].some((v,i)=>v!==next[k][i])))throw Error('Edit changed an unrelated part');
  return out;
}
const COPYABLE=new Set([RT+'slideLayout',RT+'image',RT+'hyperlink',RT+'notesSlide',RT+'audio',RT+'video',RT+'media','http://schemas.microsoft.com/office/2007/relationships/media']);

/** Duplicates a slide directly after itself. Notes are cloned; unsupported linked content refuses the copy. */
export function duplicateSlide(bytes:Uint8Array,slideId:number):Uint8Array{
  const c=context(bytes);if(c.list.items.length>=MAX_SLIDES)throw Error(`A deck can hold at most ${MAX_SLIDES} slides`);
  const src=c.slidePart.get(slideId);if(!src)throw Error('Slide no longer exists');
  const rels=readRels(c.zip,src.part);
  for(const r of rels)if(!COPYABLE.has(r.type)&&!r.external)throw Error(`This slide has linked content (${r.type.split('/').pop()}) that cannot be duplicated safely`);
  if(!hasOverride(c.types,src.part,CT_SLIDE))throw Error('Slide content type is not declared as an override');
  const names=lower(c.zip),part=nextFree(c.zip,'ppt/slides','slide','xml');if(names.has(part.toLowerCase()))throw Error('Part name collision');
  const add:Record<string,Uint8Array>={[part]:c.zip[src.part]};let types=addOverride(c.types,part,CT_SLIDE);
  let relsXml=text(c.zip,relsName(src.part));
  for(const r of rels){
    if(r.type!==RT+'notesSlide')continue;
    const notes=resolve(src.part,r.target);if(!c.zip[notes]||!hasOverride(c.types,notes,CT_NOTES))throw Error('Notes slide is not canonical');
    const nrels=readRels(c.zip,notes),back=nrels.filter(n=>n.type===RT+'slide');
    if(back.length!==1||resolve(notes,back[0].target)!==src.part)throw Error('Notes slide does not belong to this slide alone');
    const np=nextFree(c.zip,'ppt/notesSlides','notesSlide','xml');
    add[np]=c.zip[notes];
    add[relsName(np)]=strToU8(text(c.zip,relsName(notes)).replace(back[0].raw,back[0].raw.replace(/Target="[^"]*"/,`Target="${relative(np,part)}"`)));
    types=addOverride(types,np,CT_NOTES);
    relsXml=relsXml.replace(r.raw,r.raw.replace(/Target="[^"]*"/,`Target="${relative(part,np)}"`));
  }
  add[relsName(part)]=strToU8(relsXml);
  const id=newSlideId(c),rid=relId(c.presRels,c.pres);
  const presRels=c.presRels.replace('</Relationships>',`<Relationship Id="${rid}" Type="${RT}slide" Target="slides/${part.split('/').pop()}"/></Relationships>`);
  const order=c.list.items.map(i=>i.id);order.splice(order.indexOf(slideId)+1,0,id);
  return finish(c,{'ppt/presentation.xml':insertSlideId(c,id,rid,slideId),'ppt/_rels/presentation.xml.rels':presRels,'[Content_Types].xml':types},add,[],after=>{
    if(after.slides.map(s=>s.id).join()!==order.join())throw Error('Duplicated deck failed verification');
    const a=after.slides.find(s=>s.id===id)!,b=after.slides.find(s=>s.id===slideId)!;
    if(a.problems.length||a.shapes.map(s=>s.id).join()!==b.shapes.map(s=>s.id).join())throw Error('Duplicated deck failed verification');
  });
}

const OWNED_PREFIX=/^ppt\/(media|charts|diagrams|embeddings|notesSlides|comments|ink|tags|drawings|slideUpdateInfos)\//;
/** Deletes a slide (never the last one) and removes parts only it used. Refuses if something else points at it. */
export function deleteSlide(bytes:Uint8Array,slideId:number):Uint8Array{
  const c=context(bytes);if(c.list.items.length<=1)throw Error('A presentation needs at least one slide');
  const src=c.slidePart.get(slideId);if(!src)throw Error('Slide no longer exists');
  if(new RegExp(`<p:custShow\\b[\\s\\S]*?r:id="${src.rid}"`).test(c.pres))throw Error('This slide is part of a custom show. Remove it there first.');
  for(const [name] of Object.entries(c.zip)){
    if(!name.endsWith('.rels')||name===relsName(src.part))continue;
    if(name==='ppt/_rels/presentation.xml.rels')continue;
    const owner=name.replace('_rels/','').replace(/\.rels$/,'');
    for(const r of readRels(c.zip,owner))if(!r.external&&r.type!==RT+'notesSlide'&&(()=>{try{return resolve(owner,r.target)===src.part;}catch{return false;}})()){
      if(r.type===RT+'slide'&&owner.startsWith('ppt/notesSlides/'))continue;
      throw Error('Another slide links to this slide. Remove the link first.');}
  }
  const remove=new Set<string>([src.part,relsName(src.part)]);let types=c.types;
  types=dropOverride(types,src.part);
  const stack=readRels(c.zip,src.part).filter(r=>!r.external).map(r=>({from:src.part,target:resolve(src.part,r.target),type:r.type}));
  const referencedElsewhere=(p:string)=>Object.keys(c.zip).some(n=>n.endsWith('.rels')&&!remove.has(n)&&(()=>{const owner=n.replace('_rels/','').replace(/\.rels$/,'');if(remove.has(owner))return false;return readRels(c.zip,owner).some(r=>{try{return !r.external&&resolve(owner,r.target)===p;}catch{return false;}});})());
  let budget=200;
  while(stack.length&&budget-->0){
    const t=stack.pop()!;
    if(!c.zip[t.target]||remove.has(t.target)||!OWNED_PREFIX.test(t.target))continue;
    if(t.type===RT+'notesSlide'){const back=readRels(c.zip,t.target).filter(r=>r.type===RT+'slide');if(back.length!==1||resolve(t.target,back[0].target)!==src.part)continue;}
    else if(referencedElsewhere(t.target))continue;
    remove.add(t.target);if(c.zip[relsName(t.target)])remove.add(relsName(t.target));types=dropOverride(types,t.target);
    for(const r of readRels(c.zip,t.target))if(!r.external)stack.push({from:t.target,target:resolve(t.target,r.target),type:r.type});
  }
  const it=c.list.items.find(i=>i.id===slideId)!;
  let pres=c.pres.slice(0,c.list.start)+c.list.items.filter(i=>i!==it).map(i=>i.raw).join('')+c.pres.slice(c.list.end);
  const sec=sections(c.pres);
  if(sec)for(const s of sec.items)if(s.list&&s.ids.includes(slideId)){const nl=s.list.replace(new RegExp(`<p14:sldId\\b[^>]*\\sid="${slideId}"[^>]*/>`),'');pres=pres.replace(s.list,nl);}
  const presRels=c.presRels.replace(readRels(c.zip,'ppt/presentation.xml').find(r=>r.id===src.rid)!.raw,'');
  const expected=c.list.items.filter(i=>i!==it).map(i=>i.id);
  return finish(c,{'ppt/presentation.xml':pres,'ppt/_rels/presentation.xml.rels':presRels,'[Content_Types].xml':types},{},[...remove],after=>{
    if(after.slides.map(s=>s.id).join()!==expected.join())throw Error('Deleted deck failed verification');
  });
}

/** Placeholder frame in EMU, for a schematic preview only. */
export interface LayoutBox {type:string;x:number;y:number;w:number;h:number}
export interface LayoutInfo {part:string;name:string;supported:boolean;placeholders:string[];boxes:LayoutBox[]}
const MAX_LAYOUT_BOXES=24;
function placeholderBoxes(xml:string,master:string):LayoutBox[]{
  const frame=(sp:string)=>{const m=/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/.exec(sp);return m?{x:+m[1],y:+m[2],w:+m[3],h:+m[4]}:null;};
  const inherited=new Map<string,{x:number;y:number;w:number;h:number}>();
  for(const sp of master.match(/<p:sp\b[\s\S]*?<\/p:sp>/g)??[]){
    const ph=/<p:ph\b([^>]*?)\/?>/.exec(sp);const f=frame(sp);if(!ph||!f)continue;
    const t=attr(ph[1],'type')??'body';if(!inherited.has(t))inherited.set(t,f);
  }
  const out:LayoutBox[]=[];
  for(const sp of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g)??[]){
    const ph=/<p:ph\b([^>]*?)\/?>/.exec(sp);if(!ph)continue;
    const type=attr(ph[1],'type')??'body';if(SKIP_PH.has(type))continue;
    const f=frame(sp)??inherited.get(type)??(type==='ctrTitle'?inherited.get('title'):type==='subTitle'?inherited.get('body'):undefined);
    if(f&&f.w>0&&f.h>0&&out.length<MAX_LAYOUT_BOXES)out.push({type,...f});
  }
  return out;
}
const TEXT_PH=new Set(['title','ctrTitle','subTitle','body','']);
const SKIP_PH=new Set(['dt','ftr','sldNum']);
/** Layouts reachable from the slide master(s), with a verdict on whether new slides can be built from them. */
export function readLayouts(bytes:Uint8Array):LayoutInfo[]{
  const zip=openPackage(bytes),out:LayoutInfo[]=[];
  const masters=readRels(zip,'ppt/presentation.xml').filter(r=>r.type===RT+'slideMaster'&&!r.external);
  const seen=new Set<string>();
  for(const m of masters){
    const mp=resolve('ppt/presentation.xml',m.target);
    for(const l of readRels(zip,mp).filter(r=>r.type===RT+'slideLayout'&&!r.external)){
      const part=resolve(mp,l.target);if(seen.has(part)||!zip[part]||!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(part))continue;seen.add(part);
      const xml=strFromU8(zip[part]);const name=dec(/<p:cSld\b[^>]*\sname="([^"]*)"/.exec(xml)?.[1]??part.split('/').pop()!);
      const phs=[...xml.matchAll(/<p:ph\b([^>]*?)\/?>/g)].map(x=>attr(x[1],'type')??'');
      const real=phs.filter(t=>!SKIP_PH.has(t));
      out.push({part,name,supported:real.every(t=>TEXT_PH.has(t)),placeholders:real,boxes:placeholderBoxes(xml,zip[mp]?strFromU8(zip[mp]):'')});
    }
  }
  return out;
}

/** Builds a new slide from a supported layout: one empty text placeholder per layout text placeholder. */
export function newSlideFromLayout(bytes:Uint8Array,layoutPart:string,afterSlideId:number|null):Uint8Array{
  const c=context(bytes);if(c.list.items.length>=MAX_SLIDES)throw Error(`A deck can hold at most ${MAX_SLIDES} slides`);
  const layout=readLayouts(bytes).find(l=>l.part===layoutPart);
  if(!layout)throw Error('Layout no longer exists');
  if(!layout.supported)throw Error('This layout has placeholders (picture, chart, table or media) that new slides cannot create yet');
  const xml=strFromU8(c.zip[layoutPart]);
  let shapes='',n=1;
  for(const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)){
    const ph=/<p:ph\b([^>]*?)\/?>/.exec(sp[0]);if(!ph)continue;
    const type=attr(ph[1],'type')??'';if(SKIP_PH.has(type))continue;
    const idx=attr(ph[1],'idx'),label=type==='ctrTitle'||type==='title'?'Title':type==='subTitle'?'Subtitle':'Content Placeholder';
    n++;
    shapes+=`<p:sp><p:nvSpPr><p:cNvPr id="${n}" name="${label} ${n-1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${type?` type="${type}"`:''}${idx?` idx="${idx}"`:''}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t></a:t></a:r></a:p></p:txBody></p:sp>`;
  }
  const slideXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const part=nextFree(c.zip,'ppt/slides','slide','xml');
  if(!hasOverride(c.types,layoutPart))throw Error('Layout content type is not declared as an override');
  const add={[part]:strToU8(slideXml),[relsName(part)]:strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RT}slideLayout" Target="${relative(part,layoutPart)}"/></Relationships>`)};
  const id=newSlideId(c),rid=relId(c.presRels,c.pres);
  const presRels=c.presRels.replace('</Relationships>',`<Relationship Id="${rid}" Type="${RT}slide" Target="slides/${part.split('/').pop()}"/></Relationships>`);
  const order=c.list.items.map(i=>i.id);order.splice(afterSlideId===null?order.length:order.indexOf(afterSlideId)+1,0,id);
  return finish(c,{'ppt/presentation.xml':insertSlideId(c,id,rid,afterSlideId),'ppt/_rels/presentation.xml.rels':presRels,'[Content_Types].xml':addOverride(c.types,part,CT_SLIDE)},add,[],after=>{
    if(after.slides.map(s=>s.id).join()!==order.join())throw Error('New slide failed verification');
    if(after.slides.find(s=>s.id===id)!.problems.length)throw Error('New slide failed verification');
  });
}

/* ---------------------------------------------------------------------------------------
 * P2b: move/resize one text box. Only the `a:off` / `a:ext` of a top-level `p:sp` that
 * already owns an unrotated, unflipped `a:xfrm` are rewritten. Everything else is refused
 * with a reason instead of approximated. The result is reopened and verified.
 * ------------------------------------------------------------------------------------- */
export interface BoundsBox {x:number;y:number;w:number;h:number}
/** Smallest box the editor writes (10 pt), and the coordinate bound shared with the reader. */
export const MIN_BOX_EMU=127000,MAX_COORD_EMU=1e10;
/** Why a shape cannot be moved or resized, or null when it can. Pure; used by UI and package code. */
export function boundsEditIssue(s:ShapeRef):'notText'|'nested'|'noBounds'|'inherited'|'rotated'|'flipped'|null{
  if(s.parentId!==null)return 'nested';
  if(s.kind!=='text'&&s.kind!=='picture')return 'notText';
  if(!s.bounds)return 'noBounds';
  if(s.bounds.source!=='slide')return 'inherited';
  if(s.bounds.rot!==0)return 'rotated';
  if(s.bounds.flipH||s.bounds.flipV)return 'flipped';
  return null;
}
const sameBox=(a:BoundsBox,b:BoundsBox)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
function xfrmTags(xml:string,shapeId:number,spTag='p:sp',nvTag='p:nvSpPr'):{off:RegExpMatchArray;ext:RegExpMatchArray}{
  const stack:{tag:string;sp?:boolean;id?:number}[]=[];let off:RegExpMatchArray|null=null,ext:RegExpMatchArray|null=null,found=0;
  for(const m of xml.matchAll(TAG)){
    if(m[2]===undefined)continue;
    const tag=m[2];
    if(m[1]==='/'){stack.pop();continue;}
    const parent=stack.at(-1),self=m[4]==='/';
    if(tag===spTag&&parent?.tag==='p:spTree'){stack.push({tag,sp:true});continue;}
    if(tag==='p:cNvPr'&&parent?.tag===nvTag&&stack.at(-2)?.sp&&Number(attr(m[3],'id'))===shapeId){stack.at(-2)!.id=shapeId;found++;}
    const sp=stack.find(s=>s.sp&&s.id===shapeId);
    if(sp&&parent?.tag==='a:xfrm'&&stack.at(-2)?.tag==='p:spPr'&&stack.at(-3)===sp){
      if(tag==='a:off'){if(off)throw Error('Shape has more than one offset');off=m;}
      if(tag==='a:ext'){if(ext)throw Error('Shape has more than one extent');ext=m;}
    }
    if(!self)stack.push({tag});
  }
  if(found!==1||!off||!ext||!off[0].endsWith('/>')||!ext[0].endsWith('/>'))throw Error('Shape geometry is not in a supported form');
  return {off,ext};
}
/**
 * Sets the position and size of one text box (EMU). `expected` is the box the caller last saw:
 * if the stored box differs, the deck changed underneath and nothing is written.
 */
export function setShapeBounds(bytes:Uint8Array,slideId:number,shapeId:number,expected:BoundsBox,next:BoundsBox):Uint8Array{
  for(const v of [...Object.values(next),...Object.values(expected)])if(!Number.isInteger(v))throw Error('Bounds must be whole EMU values');
  const model=readDeckModel(bytes),size=model.slideSize;
  if(!size)throw Error('Slide size is not readable');
  const slide=model.slides.find(s=>s.id===slideId);if(!slide)throw Error('Slide no longer exists');
  if(slide.problems.length)throw Error('This slide has unsupported structure');
  const shape=slide.shapes.find(s=>s.id===shapeId);if(!shape)throw Error('Shape no longer exists');
  const issue=boundsEditIssue(shape);
  if(issue)throw Error(`Shape cannot be moved or resized (${issue})`);
  if(!sameBox(shape.bounds!,expected))throw Error('Shape changed since selection');
  if(next.w<MIN_BOX_EMU||next.h<MIN_BOX_EMU||next.w>size.cx*2||next.h>size.cy*2)throw Error('Size is out of range');
  if(next.x<-next.w||next.y<-next.h||next.x>size.cx||next.y>size.cy)throw Error('Position is outside the slide');
  if(sameBox(next,expected))return bytes;
  const zip=openPackage(bytes),xml=text(zip,slide.part);
  const {off,ext}=shape.kind==='picture'?xfrmTags(xml,shapeId,'p:pic','p:nvPicPr'):xfrmTags(xml,shapeId);
  const put=(tag:string,a:string,av:number,b:string,bv:number)=>tag.replace(new RegExp(`(\\s${a}=")[^"]*(")`),`$1${av}$2`).replace(new RegExp(`(\\s${b}=")[^"]*(")`),`$1${bv}$2`);
  const o=off[0],e=ext[0],oi=off.index!,ei=ext.index!;
  const [first,second]=oi<ei?[{i:oi,old:o,neu:put(o,'x',next.x,'y',next.y)},{i:ei,old:e,neu:put(e,'cx',next.w,'cy',next.h)}]:[{i:ei,old:e,neu:put(e,'cx',next.w,'cy',next.h)},{i:oi,old:o,neu:put(o,'x',next.x,'y',next.y)}];
  const out=repack(zip,{[slide.part]:xml.slice(0,first.i)+first.neu+xml.slice(first.i+first.old.length,second.i)+second.neu+xml.slice(second.i+second.old.length)});
  // Post-condition: reopen; target has the requested box, every other shape, run and part is unchanged.
  const after=readDeckModel(out),as=after.slides.find(s=>s.id===slideId);
  const moved=as?.shapes.find(s=>s.id===shapeId);
  if(!as||!moved?.bounds||!sameBox(moved.bounds,next)||moved.bounds.rot!==0||as.problems.length)throw Error('Edited deck failed verification');
  if(as.shapes.length!==slide.shapes.length||as.shapes.some((s,i)=>{const b=slide.shapes[i];return s.id!==b.id||s.kind!==b.kind||s.runCount!==b.runCount||(s.id!==shapeId&&JSON.stringify(s.bounds)!==JSON.stringify(b.bounds));}))throw Error('Edited deck failed verification');
  if(after.runs.length!==model.runs.length||after.runs.some((r,i)=>r.text!==model.runs[i].text))throw Error('Edited deck failed verification');
  const re=unzipSync(out);
  for(const name of Object.keys(zip))if(name!==slide.part&&(!re[name]||re[name].length!==zip[name].length||re[name].some((v,i)=>v!==zip[name][i])))throw Error('Edited deck changed an unrelated part');
  return out;
}

/* ---------------------------------------------------------------------------------------
 * P3: character formatting of one text box, and adding/removing a text box. Same contract
 * as P2b: patch only what the action owns, reopen, verify, refuse what is not understood.
 * ------------------------------------------------------------------------------------- */
export interface RunFormat {bold?:boolean;italic?:boolean;sizePt?:number;color?:string}
export const MIN_SIZE_PT=6,MAX_SIZE_PT=200,MAX_SHAPES_PER_SLIDE=500,MAX_BOX_TEXT=16384;
/** Source range of one top-level p:sp, found by tokenizing (never by regex over nested markup). */
function spRange(xml:string,shapeId:number,spTag='p:sp',nvTag='p:nvSpPr'):{start:number;end:number}{
  const stack:{tag:string;start?:number;id?:number}[]=[];const hits:{start:number;end:number}[]=[];
  for(const m of xml.matchAll(TAG)){
    if(m[2]===undefined)continue;const tag=m[2];
    if(m[1]==='/'){const top=stack.pop();if(top?.tag===spTag&&top.start!==undefined&&top.id===shapeId)hits.push({start:top.start,end:m.index!+m[0].length});continue;}
    const parent=stack.at(-1),self=m[4]==='/';
    if(tag===spTag&&parent?.tag==='p:spTree'){if(self)throw Error('Empty shape element');stack.push({tag,start:m.index!});continue;}
    if(tag==='p:cNvPr'&&parent?.tag===nvTag&&stack.at(-2)?.start!==undefined)stack.at(-2)!.id=Number(attr(m[3],'id'));
    if(!self)stack.push({tag});
  }
  if(hits.length!==1)throw Error('Shape geometry is not in a supported form');
  return hits[0];
}
const FILL=/<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:(?:gradFill|pattFill|blipFill)\b[\s\S]*?<\/a:(?:gradFill|pattFill|blipFill)>|<a:(?:noFill|grpFill)\s*\/>/g;
const LN=/<a:ln\b(?:[^>]*\/>|[\s\S]*?<\/a:ln>)/;
const setAttr=(open:string,name:string,value:string|null)=>{
  const re=new RegExp(`\\s${name}="[^"]*"`);
  return value===null?open.replace(re,''):re.test(open)?open.replace(re,` ${name}="${value}"`):open.replace(/^<a:rPr/,`<a:rPr ${name}="${value}"`);
};
function formatRun(inner:string,f:RunFormat):string{
  const m=/^<a:rPr\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/.exec(inner);
  let open=m?m[0].replace(/\/?>$/,''):'<a:rPr',body='';
  if(m&&m[2]!=='/'){const end=inner.indexOf('</a:rPr>');if(end<0)throw Error('Run properties are not in a supported form');body=inner.slice(m[0].length,end);}
  const rest=m?(m[2]==='/'?inner.slice(m[0].length):inner.slice(inner.indexOf('</a:rPr>')+8)):inner;
  if(!m)open='<a:rPr';
  if(f.bold!==undefined)open=setAttr(open,'b',f.bold?'1':'0');
  if(f.italic!==undefined)open=setAttr(open,'i',f.italic?'1':'0');
  if(f.sizePt!==undefined)open=setAttr(open,'sz',String(f.sizePt*100));
  if(f.color!==undefined){
    const ln=LN.exec(body),head=ln?body.slice(0,ln.index+ln[0].length):'',tail=ln?body.slice(head.length):body;
    body=head+`<a:solidFill><a:srgbClr val="${f.color.toUpperCase()}"/></a:solidFill>`+tail.replace(FILL,'');
  }
  return body?`${open}>${body}</a:rPr>${rest}`:`${open}/>${rest}`;
}
/** Applies explicit bold, italic, size and/or colour to every plain run (a:r) of one text box. */
export function formatShapeText(bytes:Uint8Array,slideId:number,shapeId:number,f:RunFormat):Uint8Array{
  const keys=Object.keys(f) as (keyof RunFormat)[];
  if(!keys.length||keys.some(k=>!['bold','italic','sizePt','color'].includes(k)))throw Error('Nothing to format');
  if((f.bold!==undefined&&typeof f.bold!=='boolean')||(f.italic!==undefined&&typeof f.italic!=='boolean'))throw Error('Bold and italic must be on or off');
  if(f.sizePt!==undefined&&(!Number.isInteger(f.sizePt)||f.sizePt<MIN_SIZE_PT||f.sizePt>MAX_SIZE_PT))throw Error(`Size must be a whole number from ${MIN_SIZE_PT} to ${MAX_SIZE_PT} pt`);
  if(f.color!==undefined&&!/^[0-9A-Fa-f]{6}$/.test(f.color))throw Error('Color must be six hex digits');
  const model=readDeckModel(bytes),slide=model.slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide no longer exists');if(slide.problems.length)throw Error('This slide has unsupported structure');
  const shape=slide.shapes.find(s=>s.id===shapeId);if(!shape)throw Error('Shape no longer exists');
  if(shape.parentId!==null||shape.kind!=='text')throw Error('Only text boxes can be formatted');
  const zip=openPackage(bytes),xml=text(zip,slide.part),{start,end}=spRange(xml,shapeId),sp=xml.slice(start,end);
  let n=0;
  const next=sp.replace(/<a:r>([\s\S]*?)<\/a:r>/g,(_all,inner:string)=>{n++;return `<a:r>${formatRun(inner,f)}</a:r>`;});
  if(!n)throw Error('This text box has no formattable text');
  if(next===sp)return bytes;
  const out=repack(zip,{[slide.part]:xml.slice(0,start)+next+xml.slice(end)});
  const after=readDeckModel(out),as=after.slides.find(s=>s.id===slideId);
  if(!as||as.problems.length||as.shapes.length!==slide.shapes.length||as.shapes.some((s,i)=>s.id!==slide.shapes[i].id||JSON.stringify(s.bounds)!==JSON.stringify(slide.shapes[i].bounds)))throw Error('Formatted deck failed verification');
  if(after.runs.length!==model.runs.length||after.runs.some((r,i)=>r.text!==model.runs[i].text||r.key!==model.runs[i].key))throw Error('Formatted deck failed verification');
  const fmt=as.shapes.find(s=>s.id===shapeId)!.fmt;
  if(!fmt||(f.bold!==undefined&&fmt.bold!==f.bold)||(f.italic!==undefined&&fmt.italic!==f.italic)||(f.sizePt!==undefined&&fmt.sizePt!==f.sizePt)||(f.color!==undefined&&fmt.color!==f.color.toUpperCase()))throw Error('Formatted deck failed verification');
  const re=unzipSync(out);
  for(const name of Object.keys(zip))if(name!==slide.part&&(!re[name]||re[name].length!==zip[name].length||re[name].some((v,i)=>v!==zip[name][i])))throw Error('Formatted deck changed an unrelated part');
  return out;
}
const esc=(t:string)=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/** The id a new shape on this slide receives. Callers use it to select the new box. */
export const nextShapeId=(s:{shapes:readonly {id:number}[]})=>s.shapes.reduce((m,x)=>Math.max(m,x.id),1)+1;
/** Adds an empty-styled text box with `label` as its text, centred in the lower half of the slide. */
export function addTextBox(bytes:Uint8Array,slideId:number,label:string):Uint8Array{
  if(typeof label!=='string'||!label.length||label.length>MAX_BOX_TEXT||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/.test(label))throw Error('Text box text is invalid');
  const model=readDeckModel(bytes),size=model.slideSize,slide=model.slides.find(s=>s.id===slideId);
  if(!size)throw Error('Slide size is not readable');if(!slide)throw Error('Slide no longer exists');
  if(slide.problems.length)throw Error('This slide has unsupported structure');
  if(slide.shapes.length>=MAX_SHAPES_PER_SLIDE)throw Error(`A slide can hold at most ${MAX_SHAPES_PER_SLIDE} shapes`);
  const id=nextShapeId(slide),w=Math.round(size.cx*0.6),h=Math.max(MIN_BOX_EMU,Math.round(size.cy*0.12)),x=Math.round((size.cx-w)/2),y=Math.round(size.cy*0.55);
  const zip=openPackage(bytes),xml=text(zip,slide.part);
  const sp=`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id-1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>${esc(label)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const tail=/(<p:extLst>(?:(?!<\/p:spTree>)[\s\S])*?<\/p:extLst>\s*)?<\/p:spTree>/.exec(xml);
  if(!tail||xml.indexOf('</p:spTree>')!==tail.index+tail[0].length-'</p:spTree>'.length)throw Error('Slide shape tree is not in a supported form');
  const out=repack(zip,{[slide.part]:xml.slice(0,tail.index)+sp+xml.slice(tail.index)});
  const after=readDeckModel(out),as=after.slides.find(s=>s.id===slideId),box=as?.shapes.find(s=>s.id===id);
  if(!as||as.problems.length||!box||box.kind!=='text'||box.parentId!==null||as.shapes.length!==slide.shapes.length+1)throw Error('Edited deck failed verification');
  if(after.runs.length!==model.runs.length+1||after.runs.find(r=>r.slideId===slideId&&r.shapeId===id)?.text!==label)throw Error('Edited deck failed verification');
  const re=unzipSync(out);
  for(const name of Object.keys(zip))if(name!==slide.part&&(!re[name]||re[name].length!==zip[name].length||re[name].some((v,i)=>v!==zip[name][i])))throw Error('Edited deck changed an unrelated part');
  return out;
}
/** Removes one top-level text box. Refused while an animation or connector still points at it. */
export function removeTextBox(bytes:Uint8Array,slideId:number,shapeId:number):Uint8Array{
  const model=readDeckModel(bytes),slide=model.slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide no longer exists');if(slide.problems.length)throw Error('This slide has unsupported structure');
  const shape=slide.shapes.find(s=>s.id===shapeId);if(!shape)throw Error('Shape no longer exists');
  if(shape.parentId!==null||shape.kind!=='text')throw Error('Only text boxes can be removed');
  const zip=openPackage(bytes),xml=text(zip,slide.part);
  if(new RegExp(`\\b(?:spid|id)="${shapeId}"(?![\\d])`).test(xml.replace(/<p:cNvPr\b[^>]*>/g,'')))throw Error('This text box is referenced by an animation or connector');
  const {start,end}=spRange(xml,shapeId);
  const out=repack(zip,{[slide.part]:xml.slice(0,start)+xml.slice(end)});
  const after=readDeckModel(out),as=after.slides.find(s=>s.id===slideId);
  const keep=slide.shapes.filter(s=>s.id!==shapeId);
  if(!as||as.problems.length||as.shapes.length!==keep.length||as.shapes.some((s,i)=>s.id!==keep[i].id||JSON.stringify(s.bounds)!==JSON.stringify(keep[i].bounds)))throw Error('Edited deck failed verification');
  const kept=model.runs.filter(r=>!(r.slideId===slideId&&r.shapeId===shapeId));
  if(after.runs.length!==kept.length||after.runs.some((r,i)=>r.text!==kept[i].text))throw Error('Edited deck failed verification');
  const re=unzipSync(out);
  for(const name of Object.keys(zip))if(name!==slide.part&&(!re[name]||re[name].length!==zip[name].length||re[name].some((v,i)=>v!==zip[name][i])))throw Error('Edited deck changed an unrelated part');
  return out;
}

/* ---------------------------------------------------------------------------------------
 * P4: pictures. Insert adds a media part, an image relationship, a content-type default and
 * a p:pic. Replace repoints one picture; remove drops one picture. Media that nothing else
 * references is deleted with it. PNG and JPEG only, bounded by sniffImage.
 * ------------------------------------------------------------------------------------- */
const attrEsc=(t:string)=>t.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function ensureDefault(types:string,ext:string,mime:string):string{
  const m=new RegExp(`<Default\\b[^>]*\\sExtension="${ext}"[^>]*/?>`,'i').exec(types);
  if(m){if(!new RegExp(`ContentType="${mime}"`,'i').test(m[0]))throw Error(`The deck maps .${ext} to a different content type`);return types;}
  if(!/<Types\b[^>]*>/.test(types))throw Error('Content types part is not in a supported form');
  return types.replace(/(<Types\b[^>]*>)/,`$1<Default Extension="${ext}" ContentType="${mime}"/>`);
}
function freeMedia(zip:Record<string,Uint8Array>,ext:string){const used=lower(zip);for(let n=1;n<100000;n++){const p=`ppt/media/image${n}.${ext}`;if(!used.has(p))return p;}throw Error('No free media name');}
function addRel(rels:string,rid:string,media:string,slidePart:string){
  if(!rels.includes('</Relationships>'))throw Error('Slide relationships are not in a supported form');
  return rels.replace('</Relationships>',`<Relationship Id="${rid}" Type="${RT}image" Target="${relative(slidePart,media)}"/></Relationships>`);
}
function treeInsert(xml:string,frag:string):string{
  const tail=/(<p:extLst>(?:(?!<\/p:spTree>)[\s\S])*?<\/p:extLst>\s*)?<\/p:spTree>/.exec(xml);
  if(!tail||xml.indexOf('</p:spTree>')!==tail.index+tail[0].length-'</p:spTree>'.length)throw Error('Slide shape tree is not in a supported form');
  return xml.slice(0,tail.index)+frag+xml.slice(tail.index);
}
/** Contain-fit of an image (96 dpi native size) inside a box, centred. Both sides must stay at least 10 pt. */
export function fitImage(img:{width:number;height:number},box:BoundsBox,cap:boolean):BoundsBox{
  const nw=img.width*9525,nh=img.height*9525,s=Math.min(box.w/nw,box.h/nh,cap?1:Infinity);
  let w=nw*s,h=nh*s;
  const grow=Math.max(1,MIN_BOX_EMU/Math.min(w,h));w=Math.round(w*grow);h=Math.round(h*grow);
  if(w<MIN_BOX_EMU||h<MIN_BOX_EMU||w>box.w+1||h>box.h+1)throw Error('Image proportions are too extreme for a slide');
  return {x:Math.round(box.x+(box.w-w)/2),y:Math.round(box.y+(box.h-h)/2),w,h};
}
const picShape=(xml:string,rid:string)=>new RegExp(`r:(?:embed|link|id|pict)="${rid}"`).test(xml);
/** Is `media` still the target of any relationship other than (relsPart,rid)? */
function mediaInUse(zip:Record<string,Uint8Array>,media:string,exceptRels:string,exceptId:string):boolean{
  for(const name of Object.keys(zip)){
    if(!name.endsWith('.rels'))continue;
    const owner=name==='_rels/.rels'?'x':name.replace(/_rels\/([^/]+)\.rels$/,'$1');
    for(const m of text(zip,name).matchAll(/<Relationship\b([^>]*?)\/?>/g)){
      const id=attr(m[1],'Id'),t=attr(m[1],'Target');
      if(!t||(name===exceptRels&&id===exceptId)||/TargetMode="External"/.test(m[1]))continue;
      try{if(resolve(owner,t)===media)return true;}catch{/* an unresolvable target cannot match */}
    }
  }
  return false;
}
/** Inserts a PNG/JPEG as a new picture centred on the slide (at most 60% of it). */
export function insertPicture(bytes:Uint8Array,slideId:number,image:Uint8Array,alt:string):Uint8Array{
  const info=sniffImage(image);
  if(typeof alt!=='string'||alt.length>200||/[\u0000-\u001f]/.test(alt))throw Error('Alt text is invalid');
  const model=readDeckModel(bytes),size=model.slideSize,slide=model.slides.find(s=>s.id===slideId);
  if(!size)throw Error('Slide size is not readable');if(!slide)throw Error('Slide no longer exists');
  if(slide.problems.length)throw Error('This slide has unsupported structure');
  if(slide.shapes.length>=MAX_SHAPES_PER_SLIDE)throw Error(`A slide can hold at most ${MAX_SHAPES_PER_SLIDE} shapes`);
  const c=context(bytes),xml=text(c.zip,slide.part),relsPart=relsName(slide.part),rels=text(c.zip,relsPart);
  if(!c.zip[relsPart])throw Error('Slide relationships are not in a supported form');
  if(!/<p:sld\b[^>]*\sxmlns:r="/.test(xml))throw Error('Slide does not declare the relationship namespace');
  const media=freeMedia(c.zip,info.ext),rid=relId(rels,xml),id=nextShapeId(slide);
  const box=fitImage(info,{x:0,y:0,w:Math.round(size.cx*0.6),h:Math.round(size.cy*0.6)},true),at={x:Math.round((size.cx-box.w)/2),y:Math.round((size.cy-box.h)/2),w:box.w,h:box.h};
  const pic=`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id-1}" descr="${attrEsc(alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${at.x}" y="${at.y}"/><a:ext cx="${at.w}" cy="${at.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  return finish(c,{[slide.part]:treeInsert(xml,pic),[relsPart]:addRel(rels,rid,media,slide.part),'[Content_Types].xml':ensureDefault(c.types,info.ext,info.mime)},{[media]:image},[],after=>{
    const as=after.slides.find(s=>s.id===slideId),p=as?.shapes.find(s=>s.id===id);
    if(!as||as.problems.length||!p||p.kind!=='picture'||p.parentId!==null||as.shapes.length!==slide.shapes.length+1||!p.bounds||p.bounds.x!==at.x||p.bounds.w!==at.w)throw Error('Edited deck failed verification');
    if(after.runs.length!==model.runs.length)throw Error('Edited deck failed verification');
  });
}
function pictureParts(bytes:Uint8Array,slideId:number,shapeId:number){
  const model=readDeckModel(bytes),slide=model.slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide no longer exists');if(slide.problems.length)throw Error('This slide has unsupported structure');
  const shape=slide.shapes.find(s=>s.id===shapeId);if(!shape)throw Error('Shape no longer exists');
  if(shape.parentId!==null||shape.kind!=='picture')throw Error('Only pictures can be changed this way');
  const c=context(bytes),xml=text(c.zip,slide.part),range=spRange(xml,shapeId,'p:pic','p:nvPicPr'),pic=xml.slice(range.start,range.end);
  const blips=[...pic.matchAll(/<a:blip\b([^>]*?)(\/?)>/g)];
  if(blips.length!==1||blips[0][2]!=='/'||/<a:srcRect\b/.test(pic))throw Error('This picture has cropping, effects or alternate formats that cannot be replaced safely');
  const rid=attr(' '+blips[0][1],'r:embed');if(!rid||/\sr:link=/.test(blips[0][1]))throw Error('This picture is linked, not embedded');
  const relsPart=relsName(slide.part),rel=readRels(c.zip,slide.part).find(r=>r.id===rid);
  if(!rel||rel.type!==RT+'image'||rel.external)throw Error('This picture is linked, not embedded');
  return {model,slide,shape,c,xml,range,pic,rid,relsPart,rels:text(c.zip,relsPart),oldMedia:resolve(slide.part,rel.target),rel};
}
/** Drops the old relationship (and its media) when nothing else uses them. */
function releaseOld(p:ReturnType<typeof pictureParts>,xmlAfter:string,rels:string):{rels:string;remove:string[]}{
  if(picShape(xmlAfter,p.rid))return {rels,remove:[]};
  const next=rels.replace(p.rel.raw,'');
  return {rels:next,remove:mediaInUse(p.c.zip,p.oldMedia,p.relsPart,p.rid)?[]:[p.oldMedia]};
}
/** Swaps the image of one embedded picture, keeping its centre and fitting inside its current box. */
export function replacePicture(bytes:Uint8Array,slideId:number,shapeId:number,image:Uint8Array):Uint8Array{
  const info=sniffImage(image),p=pictureParts(bytes,slideId,shapeId),issue=boundsEditIssue(p.shape);
  if(issue)throw Error(`Picture cannot be replaced (${issue})`);
  const old=p.shape.bounds!,box=fitImage(info,{x:old.x,y:old.y,w:old.w,h:old.h},false);
  const media=freeMedia(p.c.zip,info.ext),rid=relId(p.rels,p.xml);
  const pic=p.pic.replace(`r:embed="${p.rid}"`,`r:embed="${rid}"`),xml=p.xml.slice(0,p.range.start)+pic+p.xml.slice(p.range.end);
  const rel=releaseOld(p,xml,addRel(p.rels,rid,media,p.slide.part));
  const out=finish(p.c,{[p.slide.part]:xml,[p.relsPart]:rel.rels,'[Content_Types].xml':ensureDefault(p.c.types,info.ext,info.mime)},{[media]:image},rel.remove,after=>{
    const as=after.slides.find(s=>s.id===slideId);
    if(!as||as.problems.length||as.shapes.length!==p.slide.shapes.length||after.runs.length!==p.model.runs.length)throw Error('Edited deck failed verification');
  });
  return setShapeBounds(out,slideId,shapeId,{x:old.x,y:old.y,w:old.w,h:old.h},box);
}
/** Removes one picture and any media only it used. */
export function removePicture(bytes:Uint8Array,slideId:number,shapeId:number):Uint8Array{
  const p=pictureParts(bytes,slideId,shapeId);
  if(new RegExp(`\\b(?:spid|id)="${shapeId}"(?![\\d])`).test(p.xml.replace(/<p:cNvPr\b[^>]*>/g,'')))throw Error('This picture is referenced by an animation or connector');
  const xml=p.xml.slice(0,p.range.start)+p.xml.slice(p.range.end),rel=releaseOld(p,xml,p.rels);
  return finish(p.c,{[p.slide.part]:xml,[p.relsPart]:rel.rels},{},rel.remove,after=>{
    const as=after.slides.find(s=>s.id===slideId),keep=p.slide.shapes.filter(s=>s.id!==shapeId);
    if(!as||as.problems.length||as.shapes.length!==keep.length||as.shapes.some((s,i)=>s.id!==keep[i].id)||after.runs.length!==p.model.runs.length)throw Error('Edited deck failed verification');
  });
}

/* ---------------------------------------------------------------------------------------
 * Speaker notes (read only). Only the body placeholder of the notes page is read; the slide
 * image, slide number and header placeholders are not notes.
 * ------------------------------------------------------------------------------------- */
export const MAX_NOTES_CHARS=20000,MAX_NOTES_PARAGRAPHS=200;
export function readSlideNotes(bytes:Uint8Array,slideId:number):string[]{
  const zip=openPackage(bytes),slide=readDeckModel(bytes).slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide not found');
  const rel=readRels(zip,slide.part).find(r=>!r.external&&r.type===RT+'notesSlide');
  if(!rel)return [];
  let part:string;try{part=resolve(slide.part,rel.target);}catch{return [];}
  if(!/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(part)||!zip[part])return [];
  const xml=text(zip,part),out:string[]=[];let chars=0;
  for(const sp of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g)??[]){
    if(!/<p:ph\b[^>]*\stype="body"/.test(sp))continue;
    for(const p of sp.match(/<a:p\b[\s\S]*?<\/a:p>/g)??[]){
      const line=[...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)].map(m=>m[1]===undefined?'\n':dec(m[1])).join('');
      chars+=line.length;if(chars>MAX_NOTES_CHARS||out.length>=MAX_NOTES_PARAGRAPHS)return out;
      out.push(line);
    }
  }
  while(out.length&&!out[out.length-1].trim())out.pop();
  return out;
}

export const MAX_MULTI_EDIT=50;
export interface ShapeBoundsEdit {shapeId:number;expected:BoundsBox;next:BoundsBox}
/** Applies several bounds edits to one slide as a single result: all edits verify, or nothing is returned. */
export function setShapesBounds(bytes:Uint8Array,slideId:number,edits:readonly ShapeBoundsEdit[]):Uint8Array{
  if(!Array.isArray(edits)||edits.length<1||edits.length>MAX_MULTI_EDIT)throw Error(`Edit between 1 and ${MAX_MULTI_EDIT} shapes at once`);
  if(new Set(edits.map(e=>e.shapeId)).size!==edits.length)throw Error('Each shape can be edited once per action');
  let out=bytes;for(const e of edits)out=setShapeBounds(out,slideId,e.shapeId,e.expected,e.next);
  return out;
}

/* ---------------------------------------------------------------------------------------
 * Z-order. Stacking is document order inside p:spTree, so arranging moves whole top-level
 * elements. Nothing inside a moved element is touched; anything unrecognised fails closed.
 * ------------------------------------------------------------------------------------- */
export type ArrangeMode='front'|'back'|'forward'|'backward';
export const ARRANGE_MODES:readonly ArrangeMode[]=['front','back','forward','backward'];
const TOP_SHAPE=new Set(['p:sp','p:pic','p:grpSp','p:graphicFrame','p:cxnSp']);
const NV_OF:Record<string,string>={'p:sp':'p:nvSpPr','p:pic':'p:nvPicPr','p:grpSp':'p:nvGrpSpPr','p:graphicFrame':'p:nvGraphicFramePr','p:cxnSp':'p:nvCxnSpPr'};
function topLevelShapes(xml:string):{id:number;start:number;end:number}[]{
  const stack:{tag:string;start?:number;id?:number}[]=[],out:{id:number;start:number;end:number}[]=[];
  for(const m of xml.matchAll(TAG)){
    if(m[2]===undefined)continue;const tag=m[2];
    if(m[1]==='/'){const top=stack.pop();if(top?.start!==undefined&&TOP_SHAPE.has(top.tag)&&stack.at(-1)?.tag==='p:spTree'){if(top.id===undefined)throw Error('Shape without an id');out.push({id:top.id,start:top.start,end:m.index!+m[0].length});}continue;}
    const parent=stack.at(-1),self=m[4]==='/';
    if(parent?.tag==='p:spTree'&&!['p:nvGrpSpPr','p:grpSpPr','p:extLst'].includes(tag)&&!TOP_SHAPE.has(tag))throw Error('This slide has structure that cannot be reordered');
    if(parent?.tag==='p:spTree'&&TOP_SHAPE.has(tag)){if(self)throw Error('Empty shape element');stack.push({tag,start:m.index!});continue;}
    if(tag==='p:cNvPr'&&parent&&stack.at(-2)?.start!==undefined&&parent.tag===NV_OF[stack.at(-2)!.tag])stack.at(-2)!.id=Number(attr(m[3],'id'));
    if(!self)stack.push({tag});
  }
  return out;
}
export function arrangedOrder(ids:readonly number[],chosen:ReadonlySet<number>,mode:ArrangeMode):number[]{
  const sel=ids.filter(i=>chosen.has(i)),rest=ids.filter(i=>!chosen.has(i));
  if(mode==='front')return [...rest,...sel];
  if(mode==='back')return [...sel,...rest];
  const out=[...ids];
  if(mode==='forward'){for(let i=out.length-2;i>=0;i--)if(chosen.has(out[i])&&!chosen.has(out[i+1]))[out[i],out[i+1]]=[out[i+1],out[i]];}
  else{for(let i=1;i<out.length;i++)if(chosen.has(out[i])&&!chosen.has(out[i-1]))[out[i],out[i-1]]=[out[i-1],out[i]];}
  return out;
}
/** Changes the stacking order of the given top-level shapes as one edit. Returns the same bytes when nothing moves. */
export function arrangeShapes(bytes:Uint8Array,slideId:number,shapeIds:readonly number[],mode:ArrangeMode):Uint8Array{
  if(!ARRANGE_MODES.includes(mode))throw Error('Unknown arrange mode');
  if(!shapeIds.length||shapeIds.length>MAX_MULTI_EDIT||new Set(shapeIds).size!==shapeIds.length)throw Error(`Arrange between 1 and ${MAX_MULTI_EDIT} different shapes`);
  const model=readDeckModel(bytes),slide=model.slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide no longer exists');if(slide.problems.length)throw Error('This slide has unsupported structure');
  const zip=openPackage(bytes),xml=text(zip,slide.part),kids=topLevelShapes(xml),ids=kids.map(k=>k.id);
  if(new Set(ids).size!==ids.length)throw Error('Duplicate shape ids on this slide');
  for(const id of shapeIds)if(!ids.includes(id))throw Error('Shape no longer exists');
  const order=arrangedOrder(ids,new Set(shapeIds),mode);
  if(order.every((id,i)=>id===ids[i]))return bytes;
  const pieces=new Map(kids.map(k=>[k.id,xml.slice(k.start,k.end)]));
  let rebuilt=xml.slice(0,kids[0].start);
  order.forEach((id,i)=>{rebuilt+=pieces.get(id)!+(i<kids.length-1?xml.slice(kids[i].end,kids[i+1].start):'');});
  rebuilt+=xml.slice(kids[kids.length-1].end);
  const out=repack(zip,{[slide.part]:rebuilt});
  const after=readDeckModel(out),as=after.slides.find(s=>s.id===slideId);
  const top=(sh:ShapeRef[])=>sh.filter(s=>s.parentId===null).map(s=>s.id);
  if(!as||as.problems.length||JSON.stringify(top(as.shapes))!==JSON.stringify(order)||as.shapes.length!==slide.shapes.length)throw Error('Edited deck failed verification');
  const byId=new Map(slide.shapes.map(s=>[s.id,s]));
  if(as.shapes.some(s=>{const b=byId.get(s.id);return !b||s.kind!==b.kind||s.runCount!==b.runCount||JSON.stringify(s.bounds)!==JSON.stringify(b.bounds);}))throw Error('Edited deck failed verification');
  if(after.runs.length!==model.runs.length||after.runs.map(r=>`${r.slideId}:${r.shapeId}:${r.text}`).sort().join('\n')!==model.runs.map(r=>`${r.slideId}:${r.shapeId}:${r.text}`).sort().join('\n'))throw Error('Edited deck failed verification');
  const re=unzipSync(out);
  for(const name of Object.keys(zip))if(name!==slide.part&&(!re[name]||re[name].length!==zip[name].length||re[name].some((v,i)=>v!==zip[name][i])))throw Error('Edited deck changed an unrelated part');
  return out;
}

/* ---------------------------------------------------------------------------------------
 * Slide transitions. Only a plain, single p:transition is read or written. Transitions inside
 * mc:AlternateContent (PowerPoint 2010+ effects), sounds, or any unknown child are reported as
 * "other" and never rewritten.
 * ------------------------------------------------------------------------------------- */
export const TRANSITION_KINDS=['none','fade','push','wipe','cover'] as const,TRANSITION_DIRS=['l','r','u','d'] as const,TRANSITION_SPEEDS=['slow','med','fast'] as const;
export interface SlideTransition {kind:typeof TRANSITION_KINDS[number];dir:typeof TRANSITION_DIRS[number];speed:typeof TRANSITION_SPEEDS[number]}
export interface SlideTransitionInfo {transition:SlideTransition;editable:boolean;other:boolean}
const T_ELEMENT=/<p:transition\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>([\s\S]*?)<\/p:transition>)/g;
const T_DEFAULT:SlideTransition={kind:'none',dir:'l',speed:'med'};
function transitionOf(xml:string):{info:SlideTransitionInfo;start:number;end:number;open:string}|null{
  const all=[...xml.matchAll(T_ELEMENT)];
  if(!all.length)return null;
  const m=all[0],start=m.index!,end=start+m[0].length,attrs=m[1]??'',body=(m[2]??'').trim();
  const wrapped=all.length>1||/<mc:AlternateContent\b/.test(xml);
  const child=/^<p:(fade|push|wipe|cover)\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/>$/.exec(body);
  const attrNames=[...attrs.matchAll(/\s([\w:]+)=/g)].map(a=>a[1]);
  const plainAttrs=attrNames.every(n=>['spd','advClick','advTm'].includes(n));
  const speedRaw=/\sspd="(slow|med|fast)"/.exec(attrs)?.[1] as SlideTransition['speed']|undefined;
  const childDir=child?/\sdir="([lrud])"/.exec(child[2])?.[1] as SlideTransition['dir']|undefined:undefined;
  const supported=!!child&&plainAttrs&&(child[1]==='fade'?!child[2].trim():child[2].trim()===''||/^\s+dir="[lrud]"$/.test(child[2]));
  const kind=child?child[1] as SlideTransition['kind']:'none';
  const dir=childDir??'l',speed=speedRaw??'med';
  if(wrapped){
    // Report what a non-PowerPoint-2010 reader would see (the fallback), but never edit it.
    const fb=[...xml.matchAll(T_ELEMENT)].map(x=>/^<p:(fade|push|wipe|cover)\b[^>]*\/>$/.exec((x[2]??'').trim())).find(Boolean);
    return {info:{transition:fb?{kind:fb[1] as SlideTransition['kind'],dir:(/\sdir="([lrud])"/.exec(fb[0])?.[1] as SlideTransition['dir'])??'l',speed:'med'}:T_DEFAULT,editable:false,other:true},start,end,open:attrs};
  }
  return {info:{transition:supported?{kind,dir,speed}:T_DEFAULT,editable:supported,other:!supported},start,end,open:attrs};
}
/** Reads the transition into a slide. Never throws for a missing transition. */
export function readSlideTransition(bytes:Uint8Array,slideId:number):SlideTransitionInfo{
  const slide=readDeckModel(bytes).slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide not found');
  return transitionOf(text(openPackage(bytes),slide.part))?.info??{transition:T_DEFAULT,editable:true,other:false};
}
/** Sets or clears the transition of one slide. Returns the same bytes when nothing changes. */
export function setSlideTransition(bytes:Uint8Array,slideId:number,next:SlideTransition):Uint8Array{
  if(!TRANSITION_KINDS.includes(next.kind)||!TRANSITION_DIRS.includes(next.dir)||!TRANSITION_SPEEDS.includes(next.speed))throw Error('Unknown transition');
  const model=readDeckModel(bytes),slide=model.slides.find(s=>s.id===slideId);
  if(!slide)throw Error('Slide no longer exists');if(slide.problems.length)throw Error('This slide has unsupported structure');
  const zip=openPackage(bytes),xml=text(zip,slide.part),cur=transitionOf(xml);
  if(cur&&!cur.info.editable)throw Error('This slide has a transition that cannot be edited here');
  const was=cur?.info.transition??T_DEFAULT;
  if(was.kind===next.kind&&(next.kind==='none'||(was.speed===next.speed&&(next.kind==='fade'||was.dir===next.dir))))return bytes;
  const keep=cur?cur.open.replace(/\sspd="[^"]*"/,''):'';
  const body=next.kind==='none'?'':next.kind==='fade'?'<p:fade/>':`<p:${next.kind} dir="${next.dir}"/>`;
  const el=next.kind==='none'?'':`<p:transition spd="${next.speed}"${keep}>${body}</p:transition>`;
  let out:string;
  if(cur)out=xml.slice(0,cur.start)+el+xml.slice(cur.end);
  else{
    if(next.kind==='none')return bytes;
    const anchor=/<p:clrMapOvr\b[\s\S]*?(?:<\/p:clrMapOvr>|\/>)(?=\s*(?:<p:|<\/p:sld>|$))/.exec(xml)??/<\/p:cSld>/.exec(xml);
    if(!anchor)throw Error('This slide has structure that cannot take a transition');
    const at=anchor.index+anchor[0].length;out=xml.slice(0,at)+el+xml.slice(at);
  }
  const res=repack(zip,{[slide.part]:out}),after=readDeckModel(res),as=after.slides.find(s=>s.id===slideId);
  if(!as||as.problems.length||JSON.stringify(as.shapes)!==JSON.stringify(slide.shapes)||after.runs.length!==model.runs.length)throw Error('Edited deck failed verification');
  const got=readSlideTransition(res,slideId);
  if(got.transition.kind!==next.kind||(next.kind!=='none'&&got.transition.speed!==next.speed))throw Error('Edited deck failed verification');
  const re=unzipSync(res);
  for(const name of Object.keys(zip))if(name!==slide.part&&(!re[name]||re[name].length!==zip[name].length||re[name].some((v,i)=>v!==zip[name][i])))throw Error('Edited deck changed an unrelated part');
  return res;
}
