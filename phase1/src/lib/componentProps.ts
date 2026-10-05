/** Named source bindings and durable per-instance overrides. No DOM or editor state. */
import {parseFragment, type DefaultTreeAdapterMap} from 'parse5';
import {openTagEnd} from './componentSystem';
export type FieldKind='text'|'link'|'image'|'slot';
export interface ComponentField {name:string;kind:FieldKind;value:string;from:number;to:number}
export type Overrides=Record<string,string>;
export const ATTR_OVERRIDES='data-somnia-overrides';
export const FIELD_ATTRS:Record<FieldKind,string>={text:'data-somnia-prop-text',link:'data-somnia-prop-link',image:'data-somnia-prop-image',slot:'data-somnia-slot'};
const validName=/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/;
const escapeText=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const escapeAttr=(v:string)=>escapeText(v).replaceAll('"','&quot;');
const keyOf=(f:Pick<ComponentField,'kind'|'name'>)=>`${f.kind}:${f.name}`;
export {keyOf as fieldKey};

/** Source offsets mean changing a field does not reserialize the rest of the HTML. */
export function componentFields(html:string):ComponentField[]{
 const root=parseFragment(html,{sourceCodeLocationInfo:true});const fields:ComponentField[]=[];
 const walk=(nodes:DefaultTreeAdapterMap['node'][])=>{for(const node of nodes){
  if(!('tagName' in node))continue;
  const loc=node.sourceCodeLocation;
  for(const kind of Object.keys(FIELD_ATTRS) as FieldKind[]){
   const name=node.attrs.find(a=>a.name===FIELD_ATTRS[kind])?.value;if(name===undefined)continue;
   if(!validName.test(name))throw Error('Field names must start with a letter and contain only letters, numbers, hyphens or underscores (60 characters at most).');
   if(!loc?.startTag)throw Error(`Field "${name}" has no editable source tag.`);
   let from:number,to:number,value:string;
   if(kind==='text'||kind==='slot'){
    if(!loc.endTag)throw Error(`Field "${name}" needs an explicit closing tag.`);
    if(kind==='text'&&node.childNodes.some(n=>'tagName' in n))throw Error(`Text field "${name}" contains elements. Use a slot for HTML content.`);
    if(['script','style','textarea','title','iframe','template'].includes(node.tagName))throw Error(`Use ordinary HTML elements for field "${name}".`);
    from=loc.startTag.endOffset;to=loc.endTag.startOffset;
    value=kind==='slot'?html.slice(from,to):node.childNodes.map(n=>'value' in n?n.value:'').join('');
   }else{
    if(kind==='link'&&node.tagName!=='a'||kind==='image'&&node.tagName!=='img')throw Error(`${kind==='link'?'Link':'Image'} field "${name}" needs an ${kind==='link'?'anchor':'image'} element.`);
    const attr=kind==='link'?'href':'src';const range=loc.attrs?.[attr];
    // Attribute-less tags get a new attribute immediately before their closing delimiter.
    from=range?.startOffset??(loc.startTag.endOffset-(/\/\s*>$/.test(html.slice(loc.startOffset,loc.startTag.endOffset))?2:1));to=range?.endOffset??from;
    value=node.attrs.find(a=>a.name===attr)?.value??'';
   }
   const field={name,kind,value,from,to};if(fields.some(f=>keyOf(f)===keyOf(field)))throw Error(`Duplicate ${kind} field "${name}". Give each field a unique name.`);fields.push(field);
  }
  walk(node.childNodes);
 }};walk(root.childNodes);
 for(const a of fields)for(const b of fields)if(a!==b&&(a.kind==='text'||a.kind==='slot')&&b.from>=a.from&&b.to<=a.to)throw Error(`Field "${a.name}" contains another field. Bind the outer slot or the inner fields, not both.`);
 return fields;
}
function validateOverrides(value:unknown):Overrides{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('This instance has invalid overrides. Fix its data-somnia-overrides attribute before switching.');
 const out:Overrides=Object.create(null);
 for(const [key,v] of Object.entries(value)){
  if(!/^(text|link|image|slot):[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(key)||typeof v!=='string')throw Error('This instance has invalid overrides.');out[key]=v;
 }
 if(JSON.stringify(out).length>100000)throw Error('Instance overrides exceed the 100 KB limit.');return out;
}
export function readOverrides(html:string):Overrides{
 const root=parseFragment(html).childNodes.find(n=>'tagName' in n);
 const raw=root&&'attrs' in root?root.attrs.find(a=>a.name===ATTR_OVERRIDES)?.value:undefined;
 if(raw===undefined)return {};
 try{return validateOverrides(JSON.parse(decodeURIComponent(raw)));}catch(error){throw Error(`Cannot read instance overrides: ${error instanceof Error?error.message:String(error)}`);}
}
/** Capture edits from named fields, including code/canvas edits, while retaining fields absent from this variant. */
export function captureOverrides(instance:string,base:string):Overrides{
 const out={...readOverrides(instance)};const defaults=new Map(componentFields(base).map(f=>[keyOf(f),f.value]));
 for(const f of componentFields(instance)){
  const k=keyOf(f);if(Object.hasOwn(out,k)||!defaults.has(k)||f.value!==defaults.get(k))out[k]=f.value;
 }
 return validateOverrides(out);
}
function validateUrl(value:string,kind:FieldKind){
 // Reject executable and obfuscated schemes, including leading controls and whitespace.
 const compact=value.replace(/[\u0000-\u0020\u007f]/g,'');const scheme=/^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase();
 if(scheme&&!['http','https',...(kind==='link'?['mailto','tel']:[])].includes(scheme))throw Error('Use a relative URL, HTTPS or HTTP URL (links also allow mailto and tel).');
}
export function applyOverrides(html:string,values:Overrides):string{
 const overrides=validateOverrides(values);const originalFields=componentFields(html);const patches=originalFields.flatMap(f=>{
  const key=keyOf(f);if(!Object.hasOwn(overrides,key))return [];
  const value=overrides[key];if(f.kind==='link'||f.kind==='image')validateUrl(value,f.kind);
  const insert=f.kind==='text'?escapeText(value):f.kind==='slot'?value:`${f.from===f.to?' ':''}${f.kind==='link'?'href':'src'}="${escapeAttr(value)}"`;
  return [{from:f.from,to:f.to,insert}];
 });
 for(const p of patches.sort((a,b)=>b.from-a.from))html=html.slice(0,p.from)+p.insert+html.slice(p.to);
 if(html.length>100000)throw Error('This instance exceeds the 100 KB limit.');
 const resulting=componentFields(html);
 for(const f of originalFields){const key=keyOf(f),next=resulting.find(n=>keyOf(n)===key);if(!next)throw Error('Slot HTML removed a component field. Use balanced content inside the slot.');if(f.kind==='slot'&&Object.hasOwn(overrides,key)&&next.value!==overrides[key])throw Error('Slot HTML must stay inside its container. Use balanced HTML with explicit closing tags.');}
 return html;
}
/** Save metadata on the root. URI encoding keeps arbitrary user text out of attribute syntax. */
export function writeOverrides(html:string,values:Overrides):string{
 const overrides=validateOverrides(values);const start=html.search(/\S/);if(start<0||html[start]!=='<')throw Error('A component instance needs a root element.');const end=openTagEnd(html,start);if(end<0)throw Error('The instance root tag is incomplete.');
 let tag=html.slice(start,end).replace(/\s+data-somnia-overrides\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'');
 if(Object.keys(overrides).length)tag=tag.replace(/(\/?\s*>)$/,` ${ATTR_OVERRIDES}="${escapeAttr(encodeURIComponent(JSON.stringify(overrides)))}"$1`);
 const result=html.slice(0,start)+tag+html.slice(end);if(result.length>100000)throw Error('This instance exceeds the 100 KB limit including overrides.');return result;
}
export function switchInstance(instance:string,base:string,next:string):string{
 const overrides=captureOverrides(instance,base);return writeOverrides(applyOverrides(next,overrides),overrides);
}
