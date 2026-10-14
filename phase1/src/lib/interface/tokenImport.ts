import type {InterfaceDocument,InterfaceTextStyle,InterfaceVariable} from './schema';
const MAX_BYTES=262_144,MAX_ITEMS=200;
const COLOR=/^#[0-9a-fA-F]{6}$/;
export interface TokenImportSummary {added:number;updated:number;skipped:number;}
export interface TokenImportResult {variables:TokenImportSummary;textStyles:TokenImportSummary;warnings:string[];}
const validValue=(type:'color'|'number',value:unknown)=>type==='color'?typeof value==='string'&&COLOR.test(value):typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=32768;
const validVariableModes=(type:'color'|'number',mv:unknown)=>mv===undefined||(!!mv&&typeof mv==='object'&&!Array.isArray(mv)&&Object.entries(mv as Record<string,unknown>).every(([m,v])=>['light','dark'].includes(m)&&validValue(type,v)));
const validStyleModes=(mv:unknown)=>mv===undefined||(!!mv&&typeof mv==='object'&&!Array.isArray(mv)&&Object.entries(mv as Record<string,Record<string,unknown>>).every(([m,v])=>['light','dark'].includes(m)&&!!v&&typeof v==='object'&&Object.keys(v).every(k=>['fontSize','lineHeight','fontWeight'].includes(k))&&Number.isFinite(v.fontSize)&&(v.fontSize as number)>=1&&(v.fontSize as number)<=512&&Number.isFinite(v.lineHeight)&&(v.lineHeight as number)>=.5&&(v.lineHeight as number)<=5&&[400,500,600,700].includes(v.fontWeight as number)));
const sameModes=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
/** Local token import merging by type+name. One caller transaction covers every change, so one undo reverts the import. Invalid entries skip with warnings; a wrong file kind or size fails closed. */
export function importInterfaceTokens(doc:InterfaceDocument,json:string):TokenImportResult{
 if(new TextEncoder().encode(json).length>MAX_BYTES)throw Error('Token import exceeds the 256 KB limit.');
 let root:{kind?:unknown;version?:unknown;variables?:unknown;textStyles?:unknown};
 try{root=JSON.parse(json) as typeof root;}catch{throw Error('Token import is not valid JSON.');}
 if(root.kind!=='somnia-interface-tokens'||root.version!==1)throw Error('Not a Somnia interface token file.');
 if((Array.isArray(root.variables)&&root.variables.length>MAX_ITEMS)||(Array.isArray(root.textStyles)&&root.textStyles.length>MAX_ITEMS))throw Error('Token import exceeds the 200 item limit.');
 const warnings:string[]=[],variables:TokenImportSummary={added:0,updated:0,skipped:0},textStyles:TokenImportSummary={added:0,updated:0,skipped:0};
 const existing=new Map((doc.variables??[]).map(v=>[`${v.type}:${v.name.toLowerCase()}`,v]));
 const idMap=new Map<string,string>(),pendingAlias:{local:InterfaceVariable;alias:string}[]=[];
 for(const entry of Array.isArray(root.variables)?root.variables:[]){
  const v=entry as Partial<InterfaceVariable>,name=typeof v?.name==='string'?v.name.trim():'',type=v?.type as 'color'|'number';
  if(!name||name.length>64||(type!=='color'&&type!=='number')||!validValue(type,v?.value)||!validVariableModes(type,v?.modeValues)){variables.skipped++;warnings.push(`Skipped invalid variable: ${name||'(unnamed)'}.`);continue;}
  const key=`${type}:${name.toLowerCase()}`,target=existing.get(key),importAlias=typeof v.alias==='string'?v.alias:undefined;
  if(target){
   const dirty=target.value!==v.value||!sameModes(target.modeValues,v.modeValues)||(importAlias===undefined&&target.alias!==undefined);
   if(dirty){target.value=v.value as string|number;if(v.modeValues===undefined)delete target.modeValues;else target.modeValues=v.modeValues;if(importAlias===undefined)delete target.alias;variables.updated++;}else variables.skipped++;
   idMap.set(String(v.id??''),target.id);if(importAlias!==undefined)pendingAlias.push({local:target,alias:importAlias});continue;}
  const created:InterfaceVariable={id:crypto.randomUUID(),name,type,value:v.value as string|number,...(v.modeValues?{modeValues:v.modeValues}:{})};
  (doc.variables??=[]).push(created);existing.set(key,created);variables.added++;idMap.set(String(v.id??''),created.id);
  if(importAlias!==undefined)pendingAlias.push({local:created,alias:importAlias});
 }
 for(const {local,alias} of pendingAlias){const mapped=idMap.get(alias)??((doc.variables??[]).some(v=>v.id===alias)?alias:undefined);if(mapped&&mapped!==local.id)local.alias=mapped;else warnings.push(`Dropped unresolved alias on ${local.name}.`);}
 const styles=new Map((doc.textStyles??[]).map(s2=>[s2.name.toLowerCase(),s2]));
 for(const entry of Array.isArray(root.textStyles)?root.textStyles:[]){
  const st=entry as Partial<InterfaceTextStyle>,name=typeof st?.name==='string'?st.name.trim():'';
  const valid=!!name&&name.length<=64&&['sans-serif','serif','monospace'].includes(st?.fontFamily??'')&&Number.isFinite(st?.fontSize)&&(st!.fontSize as number)>=1&&(st!.fontSize as number)<=512&&Number.isFinite(st?.lineHeight)&&(st!.lineHeight as number)>=.5&&(st!.lineHeight as number)<=5&&[400,500,600,700].includes(st?.fontWeight as number)&&(st?.fontStretch===undefined||['condensed','expanded'].includes(st.fontStretch))&&(st?.paragraphSpacing===undefined||Number.isFinite(st.paragraphSpacing)&&(st.paragraphSpacing as number)>=0&&(st.paragraphSpacing as number)<=200)&&validStyleModes(st?.modeValues);
  if(!valid){textStyles.skipped++;warnings.push(`Skipped invalid text style: ${name||'(unnamed)'}.`);continue;}
  const target=styles.get(name.toLowerCase());
  const fields=['fontFamily','fontSize','lineHeight','fontWeight','fontStretch','paragraphSpacing'] as const;
  if(target){
   const dirty=fields.some(k=>target[k]!==st[k])||!sameModes(target.modeValues,st.modeValues);
   if(dirty){for(const k of fields){if(st[k]===undefined)delete target[k];else target[k]=st[k] as never;}if(st.modeValues===undefined)delete target.modeValues;else target.modeValues=st.modeValues;textStyles.updated++;}else textStyles.skipped++;
   continue;
  }
  const created:InterfaceTextStyle={id:crypto.randomUUID(),name,fontFamily:st.fontFamily as InterfaceTextStyle['fontFamily'],fontSize:st.fontSize as number,lineHeight:st.lineHeight as number,fontWeight:st.fontWeight as InterfaceTextStyle['fontWeight'],...(st.fontStretch?{fontStretch:st.fontStretch}:{}),...(st.paragraphSpacing!==undefined?{paragraphSpacing:st.paragraphSpacing}:{}),...(st.modeValues?{modeValues:st.modeValues}:{})};
  (doc.textStyles??=[]).push(created);styles.set(name.toLowerCase(),created);textStyles.added++;
 }
 return {variables,textStyles,warnings};
}
