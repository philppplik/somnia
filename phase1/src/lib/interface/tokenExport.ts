import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument} from './model';
import {resolveVariable} from './tokens';
const MAX_BYTES=262_144;
/** CSS identifiers are derived from local names; values are already import-validated hex colors or bounded numbers. */
const slug=(name:string)=>{const base=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/^(\d)/,'n-$1');return base||'token';};
const slugs=(names:string[])=>{const seen=new Map<string,number>();return names.map(name=>{const base=slug(name),count=seen.get(base)??0;seen.set(base,count+1);return count?`${base}-${count+1}`:base;});};
const formatted=(type:'color'|'number',value:string|number|undefined)=>value===undefined?undefined:type==='color'?String(value):`${value}px`;
/** Frozen, side-effect-free design token export. Local download only; no network, no sync promise. */
export function interfaceTokensCSS(source:InterfaceDocument){
 const doc=parseInterfaceDocument(serializeInterfaceDocument(source)),variables=doc.variables??[],names=slugs(variables.map(v=>v.name)),warnings:string[]=['Custom properties are local Interface Studio values; no external stylesheet or code base is updated.','Aliases are exported as their resolved concrete values.'],light:string[]=[],dark:string[]=[];
 variables.forEach((v,index)=>{for(const mode of ['light','dark'] as const){const value=v.alias?resolveVariable(doc,v.id,v.type,mode):{value:v.modeValues?.[mode]??v.value};if(value.diagnostic){warnings.push(value.diagnostic);continue;}const out=formatted(v.type,value.value);if(out===undefined)continue;(mode==='light'?light:dark).push(`  --${names[index]}: ${out};`);}});
 const css=`:root {\n${light.join('\n')}\n}${dark.length?`\n\n[data-theme="dark"] {\n${dark.join('\n')}\n}`:''}\n`;
 if(new TextEncoder().encode(css).length>MAX_BYTES)throw Error('Token export exceeds the 256 KB limit.');
 return {documentId:doc.id,revision:doc.revision,css,warnings:[...new Set(warnings)]};
}
export function interfaceTokensJSON(source:InterfaceDocument){
 const doc=parseInterfaceDocument(serializeInterfaceDocument(source));const body=JSON.stringify({kind:'somnia-interface-tokens',version:1,documentId:doc.id,revision:doc.revision,variables:doc.variables??[],textStyles:doc.textStyles??[],warnings:['Local design tokens only; aliases are kept by reference, not resolved.']},null,2);
 if(new TextEncoder().encode(body).length>MAX_BYTES)throw Error('Token export exceeds the 256 KB limit.');
 return body;
}
