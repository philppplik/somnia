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
/** Stored geometry in EMU. `source` says where it came from; only `slide` bounds are the shape's own. */
export interface ShapeBounds {x:number;y:number;w:number;h:number;rot:number;flipH:boolean;flipV:boolean;source:'slide'|'layout'|'master'}
export interface ShapePlaceholder {type:string;idx:string}
export interface ShapeRef {id:number;name:string;kind:ShapeKind;runCount:number;parentId:number|null;bounds:ShapeBounds|null;ph:ShapePlaceholder|null}
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

export interface LayoutInfo {part:string;name:string;supported:boolean;placeholders:string[]}
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
      out.push({part,name,supported:real.every(t=>TEXT_PH.has(t)),placeholders:real});
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
