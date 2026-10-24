/** Schema-driven Advanced Export: a studio declares fields declaratively, the shared dialog renders any schema. */
export type ExportValue=string|number|boolean;
export type ExportValues=Record<string,ExportValue>;
export type ExportFieldType='select'|'text'|'number'|'range'|'checkbox';
export interface ExportFieldOption{value:string;labelKey:string}
export interface ExportField{
 id:string;type:ExportFieldType;labelKey:string;
 /** Stable data-testid for controls with a public hook (ratcheted in ds-hooks.json). */
 testId?:string;
 /** Optional group heading key; fields with the same group render under one heading in declaration order. */
 group?:string;
 options?:ExportFieldOption[];
 min?:number;max?:number;step?:number;unit?:string;
 maxLength?:number;
 visibleWhen?:(values:ExportValues)=>boolean;
}
export interface ExportSchema{
 studio:string;
 fields:ExportField[];
 defaults:ExportValues;
 /** Cross-field validation; returns an i18n error key or null. */
 validate:(values:ExportValues)=>string|null;
}
export function visibleExportFields(schema:ExportSchema,values:ExportValues):ExportField[]{
 return schema.fields.filter(f=>!f.visibleWhen||f.visibleWhen(values));
}
/** Ordered unique group keys of the visible fields, '' first for ungrouped leading fields. */
export function exportFieldGroups(schema:ExportSchema,values:ExportValues):(string|null)[]{
 const seen=new Set<string|null>();const out:(string|null)[]=[];
 for(const f of visibleExportFields(schema,values)){const g=f.group??null;if(!seen.has(g)){seen.add(g);out.push(g);}}
 return out;
}
export interface ExportPreset{name:string;values:ExportValues}
const MAX_PRESETS=20,MAX_NAME=40;
function key(studio:string){return `somnia.export.presets.${studio}`;}
function storage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export function loadExportPresets(studio:string):ExportPreset[]{
 const s=storage();if(!s)return [];
 try{const raw=s.getItem(key(studio));if(!raw)return [];
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed))return [];
  return parsed.filter((p):p is ExportPreset=>!!p&&typeof p.name==='string'&&p.name.length>0&&!!p.values&&typeof p.values==='object').slice(0,MAX_PRESETS);
 }catch{return [];}
}
export function saveExportPreset(studio:string,name:string,values:ExportValues):ExportPreset[]{
 const trimmed=name.trim().slice(0,MAX_NAME);if(!trimmed)throw Error('Preset name required.');
 const s=storage();if(!s)throw Error('No storage.');
 const clean:ExportValues={};for(const [k,v] of Object.entries(values))if(['string','number','boolean'].includes(typeof v))clean[k]=v;
 const list=loadExportPresets(studio).filter(p=>p.name!==trimmed);list.unshift({name:trimmed,values:clean});
 const next=list.slice(0,MAX_PRESETS);s.setItem(key(studio),JSON.stringify(next));return next;
}
export function deleteExportPreset(studio:string,name:string):ExportPreset[]{
 const s=storage();if(!s)return [];
 const next=loadExportPresets(studio).filter(p=>p.name!==name);s.setItem(key(studio),JSON.stringify(next));return next;
}
/** Formats a byte count for the size readout, e.g. "812 KB" / "2.4 MB". */
export function formatExportSize(bytes:number,units:{b:string;kb:string;mb:string}):string{
 if(!Number.isFinite(bytes)||bytes<0)return '';
 if(bytes<1024)return `${Math.round(bytes)} ${units.b}`;
 if(bytes<1024*1024)return `${(bytes/1024).toFixed(bytes<10240?1:0)} ${units.kb}`;
 return `${(bytes/1024/1024).toFixed(1)} ${units.mb}`;
}
