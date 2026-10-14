import type {InterfaceDocument,InterfaceNode} from './schema';
import type {InterfaceVariable,InterfaceTextStyle} from './schema';
export interface VariableResult {value:string|number|undefined;diagnostic?:string;}
/** Typed local aliases only. No expressions, CSS injection, URLs or external lookup. */
export function resolveVariable(doc:InterfaceDocument,id:string,expected:'color'|'number'):VariableResult{
 const variables=new Map((doc.variables??[]).map(v=>[v.id,v]));const seen=new Set<string>();let current=id;
 for(let depth=0;depth<64;depth++){const v=variables.get(current);if(!v)return {value:undefined,diagnostic:`Missing ${expected} variable: ${current}`};if(v.type!==expected)return {value:undefined,diagnostic:`Variable type mismatch: ${v.name}`};if(seen.has(current))return {value:undefined,diagnostic:`Variable alias cycle: ${v.name}`};seen.add(current);if(!v.alias)return {value:v.value};current=v.alias;}
 return {value:undefined,diagnostic:'Variable alias depth exceeded.'};
}
export const DEFAULT_TEXT_STYLE:InterfaceTextStyle={id:'default',name:'Default',fontFamily:'sans-serif',fontSize:16,lineHeight:1.25,fontWeight:400};
export function resolvedTextStyle(doc:InterfaceDocument,node:InterfaceNode):InterfaceTextStyle{return doc.textStyles?.find(s=>s.id===node.textStyleId)??DEFAULT_TEXT_STYLE;}
export function resolveInterfaceValues(doc:InterfaceDocument):{document:InterfaceDocument;diagnostics:string[]}{
 const result=structuredClone(doc),diagnostics:string[]=[];
 for(const n of result.nodes){for(const [key,id] of Object.entries(n.bindings??{})){const expected=key==='fill'?'color':'number',value=resolveVariable(doc,id,expected);if(value.diagnostic)diagnostics.push(value.diagnostic);else if(key==='fill')n.fill=String(value.value);else if(n.layout)n.layout.gap=Number(value.value);}
 if(n.textStyleId&&!doc.textStyles?.some(s=>s.id===n.textStyleId))diagnostics.push(`Missing text style: ${n.textStyleId}`);}
 return {document:result,diagnostics:[...new Set(diagnostics)]};
}
/** Imports/edits can preserve dangling bindings so the fallback source value remains visible. */
export function validateInterfaceTokens(doc:InterfaceDocument):void{
 const ids=new Set<string>();const validId=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);const name=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=256;
 if(doc.variables!==undefined&&(!Array.isArray(doc.variables)||doc.variables.length>1000))throw Error('Invalid variable collection.');
 for(const v of doc.variables??[]){if(!v||typeof v!=='object'||!validId(v.id)||ids.has(v.id)||!name(v.name)||!['color','number'].includes(v.type)||v.alias!==undefined&&!validId(v.alias)||(v.type==='color'?typeof v.value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v.value):typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<0||v.value>32768))throw Error('Invalid variable.');ids.add(v.id);}
 if(doc.textStyles!==undefined&&(!Array.isArray(doc.textStyles)||doc.textStyles.length>500))throw Error('Invalid text style collection.');
 for(const s of doc.textStyles??[]){if(!s||typeof s!=='object'||!validId(s.id)||ids.has(s.id)||!name(s.name)||!['sans-serif','serif','monospace'].includes(s.fontFamily)||!Number.isFinite(s.fontSize)||s.fontSize<1||s.fontSize>512||!Number.isFinite(s.lineHeight)||s.lineHeight<.5||s.lineHeight>5||![400,500,600,700].includes(s.fontWeight))throw Error('Invalid text style.');ids.add(s.id);}
 for(const n of doc.nodes){if(n.bindings!==undefined){if(!n.bindings||typeof n.bindings!=='object'||Array.isArray(n.bindings)||!Object.entries(n.bindings).every(([k,v])=>['fill','gap'].includes(k)&&validId(v))||n.bindings.gap&&!n.layout)throw Error('Invalid variable binding.');}
 if(n.textStyleId!==undefined&&(n.kind!=='text'||!validId(n.textStyleId)))throw Error('Invalid text style binding.');if(n.annotation!==undefined&&(typeof n.annotation!=='string'||n.annotation.length>4000))throw Error('Invalid annotation.');if(n.ready!==undefined&&typeof n.ready!=='boolean')throw Error('Invalid readiness.');}
}
export function addVariable(doc:InterfaceDocument,type:InterfaceVariable['type'],name:string):string{const id=crypto.randomUUID();(doc.variables??=[]).push({id,name,type,value:type==='color'?'#7756e8':16});return id;}
