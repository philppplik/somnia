import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
/**
 * Dublin Core metadata (docProps/core.xml) for an exported OOXML copy (pptx, xlsx, docx).
 * Only non-empty fields are written; empty fields leave any existing values untouched.
 * No new parts beyond core.xml and its content-type override.
 */
export interface CorePropsMeta{title:string;author:string;description:string}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const clean=(s:string)=>s.replace(/[\r\n]+/g,' ').trim().slice(0,512);
function upsert(xml:string,tag:string,value:string):string{
 const re=new RegExp(`<${tag}(\\s[^>]*)?(/>|>.*?</${tag}>)`,'s');
 const node=`<${tag}>${esc(value)}</${tag}>`;
 return re.test(xml)?xml.replace(re,node):xml.replace('</cp:coreProperties>',`${node}</cp:coreProperties>`);
}
const EMPTY_CORE='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>';
export function writeCoreProperties(bytes:Uint8Array,meta:CorePropsMeta):Uint8Array{
 const pairs=([['dc:title',meta.title],['dc:creator',meta.author],['dc:description',meta.description]] as const)
  .map(([tag,v])=>[tag,clean(v)] as const).filter(([,v])=>v.length>0);
 if(!pairs.length)return bytes;
 const zip=unzipSync(bytes);
 let core=zip['docProps/core.xml']?strFromU8(zip['docProps/core.xml']):'';
 if(!core){
  core=EMPTY_CORE;
  const types=zip['[Content_Types].xml']?strFromU8(zip['[Content_Types].xml']):'';
  if(types&&!types.includes('/docProps/core.xml'))zip['[Content_Types].xml']=strToU8(types.replace('</Types>','<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'));
 }
 for(const [tag,value] of pairs)core=upsert(core,tag,value);
 zip['docProps/core.xml']=strToU8(core);
 return zipSync(zip);
}
