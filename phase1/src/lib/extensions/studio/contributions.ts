import {STUDIO_POINTS,LIMITS,isStudioPointId,type PanelSlot,type StudioPointId} from './points';
/** New permissions for studio contributions. Kept apart from PERMISSIONS (apiVersion 1) until the manifest wiring lands, see the doc. */
export const STUDIO_PERMISSIONS=['studio.import','studio.export','studio.inspector','studio.commands','studio.panels'] as const;
export type StudioPermission=typeof STUDIO_PERMISSIONS[number];
const ID=/^[a-z0-9][a-z0-9-]*$/;
export interface FormatClaim{ext:string;mime?:string;priority:number}
/** Importer: bytes in, interchange model out. Runs in a hidden sandboxed iframe (no network, opaque origin), never in the host realm. */
export interface ImporterContribution{id:string;label:string;studio:StudioPointId;formats:FormatClaim[];code:string}
export interface ExporterContribution{id:string;label:string;studio:StudioPointId;format:{ext:string;mime:string};code:string}
export type FieldDef=
 |{id:string;type:'number';label:string;min?:number;max?:number;step?:number;op:OperationBinding}
 |{id:string;type:'toggle';label:string;op:OperationBinding}
 |{id:string;type:'select';label:string;options:{value:string;label:string}[];op:OperationBinding}
 |{id:string;type:'text';label:string;maxLength?:number;op:OperationBinding}
 |{id:string;type:'color';label:string;op:OperationBinding};
/** Maps a field value to one Studio operation. The value lands in `args[valueKey]`; the host builds the target from the current selection. */
export interface OperationBinding{type:string;valueKey:string;args?:Record<string,string|number|boolean>}
/** Declarative inspector section (preferred). `html` sections are iframe-based like panels and read-only. */
export interface InspectorSectionContribution{id:string;title:string;studio:StudioPointId;when:string[];fields?:FieldDef[];html?:string;order?:number}
export interface StudioCommandContribution{id:string;title:string;studio:StudioPointId[];when?:string[];category:'Edit'|'Insert'|'View'|'Tools'}
export interface StudioPanelContribution{id:string;title:string;studio:StudioPointId;slot:PanelSlot;html:string}
export interface StudioContributions{importers:ImporterContribution[];exporters:ExporterContribution[];inspectorSections:InspectorSectionContribution[];commands:StudioCommandContribution[];panels:StudioPanelContribution[]}
export const emptyStudioContributions=():StudioContributions=>({importers:[],exporters:[],inspectorSections:[],commands:[],panels:[]});
export type StudioResult={ok:true;value:StudioContributions}|{ok:false;errors:string[]};
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const NEED:Record<keyof StudioContributions,StudioPermission>={importers:'studio.import',exporters:'studio.export',inspectorSections:'studio.inspector',commands:'studio.commands',panels:'studio.panels'};
/** Validates `contributes.studios` of an untrusted manifest. `extId` scopes command ids, `permissions` gates each list. Unknown keys are rejected, not dropped, so a typo cannot silently disable a feature. */
export function validateStudioContributions(input:unknown,extId:string,permissions:readonly string[]):StudioResult{
 const errors:string[]=[];if(input===undefined)return{ok:true,value:emptyStudioContributions()};
 if(!obj(input))return{ok:false,errors:['contributes.studios must be an object.']};
 for(const k of Object.keys(input))if(!(k in NEED))errors.push(`contributes.studios.${k} is not a known extension point.`);
 const out=emptyStudioContributions();
 const list=(k:keyof StudioContributions):unknown[]=>{const v=input[k];if(v===undefined)return[];if(!Array.isArray(v)||v.length>50){errors.push(`studios.${k} must be an array of at most 50 items.`);return[];}if(v.length&&!permissions.includes(NEED[k]))errors.push(`studios.${k} needs the "${NEED[k]}" permission.`);return v;};
 const studio=(x:Record<string,unknown>,where:string,need?:'canImport'|'canExport')=>{if(!isStudioPointId(x.studio)){errors.push(`${where}: unknown studio ${String(x.studio)}.`);return null;}if(need&&!STUDIO_POINTS[x.studio][need]){errors.push(`${where}: ${x.studio} does not support ${need==='canImport'?'importers':'exporters'}.`);return null;}return x.studio;};
 const id=(x:Record<string,unknown>,where:string)=>{if(typeof x.id!=='string'||!ID.test(x.id)){errors.push(`${where}: "id" must be lowercase letters, digits, dashes.`);return null;}return x.id;};
 const title=(x:Record<string,unknown>,where:string,key='title')=>{const v=x[key];if(typeof v!=='string'||!v.trim()||v.length>60){errors.push(`${where}: "${key}" must be 1 to 60 characters.`);return null;}return v;};
 const code=(x:Record<string,unknown>,where:string)=>{if(typeof x.code!=='string'||!x.code||x.code.length>100000){errors.push(`${where}: "code" must be a string up to 100000 characters.`);return null;}return x.code;};
 list('importers').forEach((x,i)=>{const w=`importers[${i}]`;if(!obj(x))return void errors.push(`${w} must be an object.`);const s=studio(x,w,'canImport'),i2=id(x,w),l=title(x,w,'label'),c=code(x,w);
  const f=Array.isArray(x.formats)&&x.formats.length&&x.formats.length<=10?x.formats.flatMap(y=>obj(y)&&typeof y.ext==='string'&&/^[a-z0-9]{1,10}$/.test(y.ext)&&typeof y.priority==='number'&&y.priority>=0&&y.priority<=9?[{ext:y.ext,priority:y.priority,...(typeof y.mime==='string'?{mime:y.mime}:{})}]:[]):[];
  if(!f.length||f.length!==(x.formats as unknown[]|undefined)?.length)errors.push(`${w}: "formats" needs 1 to 10 entries with a lowercase ext and priority 0 to 9. Extensions can claim up to 9; built-in claims use 10, so they always win.`);
  if(s&&i2&&l&&c&&f.length)out.importers.push({id:i2,label:l,studio:s,formats:f,code:c});});
 list('exporters').forEach((x,i)=>{const w=`exporters[${i}]`;if(!obj(x))return void errors.push(`${w} must be an object.`);const s=studio(x,w,'canExport'),i2=id(x,w),l=title(x,w,'label'),c=code(x,w);
  const f=obj(x.format)&&typeof x.format.ext==='string'&&/^[a-z0-9]{1,10}$/.test(x.format.ext)&&typeof x.format.mime==='string'&&x.format.mime.length<=100?{ext:x.format.ext,mime:x.format.mime}:null;if(!f)errors.push(`${w}: "format" needs ext and mime.`);
  if(s&&i2&&l&&c&&f)out.exporters.push({id:i2,label:l,studio:s,format:f,code:c});});
 list('inspectorSections').forEach((x,i)=>{const w=`inspectorSections[${i}]`;if(!obj(x))return void errors.push(`${w} must be an object.`);const s=studio(x,w),i2=id(x,w),t=title(x,w);
  const sk=s?STUDIO_POINTS[s]:null;if(sk&&!sk.slots.includes('inspector-section'))errors.push(`${w}: ${s} has no inspector-section slot.`);
  const when=Array.isArray(x.when)&&x.when.length&&x.when.every(k=>typeof k==='string'&&!!sk&&sk.selectionKinds.includes(k))?x.when as string[]:null;if(!when)errors.push(`${w}: "when" needs known selection kinds${sk?` (${sk.selectionKinds.join(', ')})`:''}.`);
  const hasFields=x.fields!==undefined,hasHtml=x.html!==undefined;if(hasFields===hasHtml)errors.push(`${w}: give either "fields" or "html", not both and not neither.`);
  let fields:FieldDef[]|undefined;if(hasFields){if(!Array.isArray(x.fields)||x.fields.length>LIMITS.maxFields){errors.push(`${w}: "fields" must be an array of at most ${LIMITS.maxFields}.`);}else{fields=[];x.fields.forEach((f,j)=>{const fw=`${w}.fields[${j}]`;
    if(!obj(f)||typeof f.id!=='string'||!ID.test(f.id)||typeof f.label!=='string'||!['number','toggle','select','text','color'].includes(String(f.type))||!obj(f.op)||typeof f.op.type!=='string'||typeof f.op.valueKey!=='string'){errors.push(`${fw} needs id, label, a known type and op {type,valueKey}.`);return;}
    if(sk&&!sk.operations.includes(f.op.type)){errors.push(`${fw}: ${s} does not allow operation ${f.op.type}. Allowed: ${sk.operations.join(', ')}.`);return;}
    if(f.type==='select'&&!(Array.isArray(f.options)&&f.options.length&&f.options.length<=50&&f.options.every(o=>obj(o)&&typeof o.value==='string'&&typeof o.label==='string'))){errors.push(`${fw}: select needs options.`);return;}
    fields!.push(f as unknown as FieldDef);});}}
  if(hasHtml&&(typeof x.html!=='string'||x.html.length>50000))errors.push(`${w}: "html" must be a string up to 50000 characters.`);
  if(s&&i2&&t&&when&&(hasFields?fields&&fields.length:typeof x.html==='string'))out.inspectorSections.push({id:i2,title:t,studio:s,when,...(fields?{fields}:{}),...(typeof x.html==='string'?{html:x.html}:{}),...(typeof x.order==='number'?{order:x.order}:{})});});
 list('commands').forEach((x,i)=>{const w=`commands[${i}]`;if(!obj(x))return void errors.push(`${w} must be an object.`);const t=title(x,w);
  if(typeof x.id!=='string'||!x.id.startsWith(extId+'.'))errors.push(`${w}: id must start with "${extId}.".`);
  const st=Array.isArray(x.studio)&&x.studio.length&&x.studio.every(isStudioPointId)?x.studio as StudioPointId[]:null;if(!st)errors.push(`${w}: "studio" needs a list of known studios.`);
  if(!['Edit','Insert','View','Tools'].includes(String(x.category)))errors.push(`${w}: category must be Edit, Insert, View or Tools.`);
  const when=x.when===undefined?undefined:Array.isArray(x.when)&&x.when.every(k=>typeof k==='string')?x.when as string[]:(errors.push(`${w}: "when" must be a list of selection kinds.`),undefined);
  if(when&&st)for(const k of when)if(!st.some(s=>STUDIO_POINTS[s].selectionKinds.includes(k)))errors.push(`${w}: "${k}" is not a selection kind of ${st.join(', ')}.`);
  if(typeof x.id==='string'&&t&&st&&['Edit','Insert','View','Tools'].includes(String(x.category)))out.commands.push({id:x.id,title:t,studio:st,...(when?{when}:{}),category:x.category as StudioCommandContribution['category']});});
 list('panels').forEach((x,i)=>{const w=`panels[${i}]`;if(!obj(x))return void errors.push(`${w} must be an object.`);const s=studio(x,w),i2=id(x,w),t=title(x,w);
  if(s&&!STUDIO_POINTS[s].slots.includes(x.slot as PanelSlot))errors.push(`${w}: ${s} has no "${String(x.slot)}" slot. Available: ${STUDIO_POINTS[s].slots.join(', ')}.`);
  if(typeof x.html!=='string'||x.html.length>50000)errors.push(`${w}: "html" must be a string up to 50000 characters.`);
  if(s&&i2&&t&&STUDIO_POINTS[s].slots.includes(x.slot as PanelSlot)&&typeof x.html==='string'&&x.html.length<=50000)out.panels.push({id:i2,title:t,studio:s,slot:x.slot as PanelSlot,html:x.html});});
 return errors.length?{ok:false,errors}:{ok:true,value:out};
}
