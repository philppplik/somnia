/** Asset schema 1. Execution API/version and archive policy remain independent. */
export const ASSET_SCHEMA_VERSION = 1;
export const BUILTIN_REGISTRY_VERSION = 1;
export const BUILTIN_GLYPHS = Object.freeze({extension:'vadivam:puzzle',command:'vadivam:command',panel:'vadivam:panel-right',search:'vadivam:search',settings:'vadivam:settings',code:'vadivam:code',image:'vadivam:image',document:'vadivam:file-text',table:'vadivam:table',audio:'vadivam:audio-lines',video:'vadivam:video'} as const);
export type BuiltinKey = keyof typeof BUILTIN_GLYPHS;
export type AssetDiagnostic = {code:string;field:string;path?:string};
export type ListingImage = {path:string;alt:string;caption?:string;theme?:'light'|'dark'|'neutral'};
export type AssetManifest = {packageFormat?:2;assetSchemaVersion?:1;icon?:string;'icon@dark'?:string;screenshots?:ListingImage[];cover?:{path:string;alt:string};glyphs?:Record<string,string>};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=['icon','icon@dark','screenshots','cover','glyphs','assetSchemaVersion'];
export function validAssetPath(path:unknown):path is string {
 if(typeof path!=='string'||!path||path.length>180||!/^[\x00-\x7f]+$/.test(path))return false;
 return path.split('/').every(s=>/^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(s)&&!s.endsWith('.')&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s));
}
/** Validate the subset without stripping/changing legacy execution fields. */
export function validateAssetManifest(input:unknown,mode:'local'|'store'='local'):AssetDiagnostic[]{
 const errors:AssetDiagnostic[]=[];
 const add=(code:string,field:string,path?:string)=>errors.push({code,field,...(path?{path}:{})});
 if(!obj(input)){add('ASSET_SCHEMA_UNSUPPORTED','assets');return errors;}
 const contributionInput=obj(input.contributes)?input.contributes:{};
 const has=fields.some(k=>Object.hasOwn(input,k)) || (['commands','panels'].some(k=>Array.isArray(contributionInput[k])&&(contributionInput[k] as unknown[]).some(v=>obj(v)&&v.icon!==undefined)));
 if(input.packageFormat!==undefined&&input.packageFormat!==1&&input.packageFormat!==2)add('ASSET_PACKAGE_UNSUPPORTED','packageFormat');
 if(has&&input.packageFormat!==2)add('ASSET_PACKAGE_REQUIRED','packageFormat');
 if(has&&input.assetSchemaVersion!==1)add('ASSET_SCHEMA_UNSUPPORTED','assetSchemaVersion');
 if(!has&&mode==='local')return errors;
 const path=(v:unknown,field:string,suffix:RegExp)=>{if(!validAssetPath(v))add('ASSET_PATH_INVALID',field);else if(!suffix.test(v))add('ASSET_TYPE_MISMATCH',field,v);};
 const text=(v:unknown,field:string,max:number)=>{if(typeof v!=='string'||[...v.trim()].length<1||[...v.trim()].length>max||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))add('ASSET_SCHEMA_UNSUPPORTED',field);};
 if(input.icon!==undefined)path(input.icon,'icon',/\.png$/);else if(mode==='store')add('ASSET_MISSING','icon');
 if(input['icon@dark']!==undefined){path(input['icon@dark'],'icon@dark',/\.png$/);if(input.icon===undefined)add('ASSET_REFERENCE_UNKNOWN','icon@dark');}
 const image=(v:unknown,field:string,cover=false)=>{if(!obj(v)){add('ASSET_SCHEMA_UNSUPPORTED',field);return;}for(const k of Object.keys(v))if(!(cover?['path','alt']:['path','alt','caption','theme']).includes(k))add('ASSET_SCHEMA_UNSUPPORTED',`${field}.${k}`);path(v.path,`${field}.path`,/\.(png|jpe?g)$/);text(v.alt,`${field}.alt`,240);if(v.caption!==undefined)text(v.caption,`${field}.caption`,160);if(v.theme!==undefined&&!['light','dark','neutral'].includes(String(v.theme)))add('ASSET_SCHEMA_UNSUPPORTED',`${field}.theme`);};
 if(input.screenshots!==undefined){if(!Array.isArray(input.screenshots)||input.screenshots.length>8)add('ASSET_SCHEMA_UNSUPPORTED','screenshots');else{if(mode==='store'&&!input.screenshots.length)add('ASSET_MISSING','screenshots');input.screenshots.forEach((v,i)=>image(v,`screenshots[${i}]`));}}else if(mode==='store')add('ASSET_MISSING','screenshots');
 if(input.cover!==undefined)image(input.cover,'cover',true);
 const glyphs=obj(input.glyphs)?input.glyphs:{};
 if(input.glyphs!==undefined){if(!obj(input.glyphs)||Object.keys(glyphs).length>32)add('ASSET_SCHEMA_UNSUPPORTED','glyphs');for(const[k,v]of Object.entries(glyphs)){if(!/^[a-z][a-z0-9-]{0,39}$/.test(k))add('ASSET_SCHEMA_UNSUPPORTED',`glyphs.${k}`);path(v,`glyphs.${k}`,/\.svg$/);}}
 const contributes=obj(input.contributes)?input.contributes:{};
 for(const kind of ['commands','panels'])if(Array.isArray(contributes[kind]))contributes[kind].forEach((v,i)=>{if(!obj(v)||v.icon===undefined)return;const ref=v.icon;if(typeof ref!=='string'||!(ref.startsWith('builtin:')&&Object.hasOwn(BUILTIN_GLYPHS,ref.slice(8))||ref.startsWith('glyph:')&&Object.hasOwn(glyphs,ref.slice(6))))add('ASSET_REFERENCE_UNKNOWN',`contributes.${kind}[${i}].icon`);});
 return errors;
}
/** Detect duplicate keys before JSON.parse loses them. Uses a strict JSON grammar;
 * unknown legacy keys are preserved, never filtered. */
export function parseAssetJson(text:string):unknown {
 let p=0;const ws=()=>{while(/[\t\n\r ]/.test(text[p]??'!'))p++;};
 const str=():string=>{const start=p;if(text[p++]!=='"')throw Error('Invalid JSON');while(p<text.length){const c=text[p++];if(c==='"')return JSON.parse(text.slice(start,p));if(c==='\\')p++;}throw Error('Invalid JSON');};
 const value=(depth=0):void=>{if(depth>64)throw Error('ASSET_PROCESSING_LIMIT');ws();const c=text[p];if(c==='{'){p++;ws();const keys=new Set<string>();if(text[p]==='}'){p++;return;}while(true){ws();const k=str();if(keys.has(k))throw Error('ASSET_SCHEMA_UNSUPPORTED: duplicate JSON key');keys.add(k);ws();if(text[p++]!==':')throw Error('Invalid JSON');value(depth+1);ws();if(text[p]==='}'){p++;return;}if(text[p++]!==',')throw Error('Invalid JSON');}}else if(c==='['){p++;ws();if(text[p]===']'){p++;return;}while(true){value(depth+1);ws();if(text[p]===']'){p++;return;}if(text[p++]!==',')throw Error('Invalid JSON');}}else if(c==='"'){str();}else{const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(p));if(!m)throw Error('Invalid JSON');p+=m[0].length;}};
 value();ws();if(p!==text.length)throw Error('Invalid JSON');return JSON.parse(text);
}
