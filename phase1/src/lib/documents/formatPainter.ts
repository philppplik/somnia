import {checkFormatPatch,checkParaPatch,type FormatPatch,type FormatState,type ParaPatch,type ParaState} from './protocol';
/** Character and paragraph formatting copied from one place, to be pasted onto another. */
export interface Painted{format:FormatPatch;para:ParaPatch}
const TRI=['bold','italic','underline','strike','smallCaps','allCaps','doubleStrike'] as const;
const CHAR_VALUES=['font','size','color','underlineColor','charShading','spacing','scale','vertAlign'] as const;
const PARA_VALUES=['align','indentLeft','indentFirst','indentRight','spaceBefore','spaceAfter','keepNext','keepLines','widowControl','contextualSpacing','shading'] as const;
/** Keeps `key` only when the engine would accept it alone. */
function keep<T extends object>(out:T,key:string,value:unknown,check:(p:unknown)=>unknown){
 try{check({[key]:value});(out as Record<string,unknown>)[key]=value;}catch{/* a value the engine would refuse is left out */}
}
/**
 * What can be copied from the current format and paragraph state: every value the selection shares (a mixed value is left out),
 * checked the way an edit would be. Link, page-structure options (page break before, drop cap, border) and the paragraph style are not copied.
 */
export function capturePaint(f:FormatState|null,p:ParaState|null):Painted{
 const format:FormatPatch={},para:ParaPatch={};
 if(f){
  for(const k of TRI){const v=f[k];if(v==='on')keep(format,k,true,checkFormatPatch);else if(v==='off')keep(format,k,false,checkFormatPatch);}
  if(f.underlineStyle&&f.underlineStyle!=='none')keep(format,'underlineStyle',f.underlineStyle,checkFormatPatch);
  for(const k of CHAR_VALUES){const v=f[k];if(v!==null&&v!==undefined)keep(format,k,v,checkFormatPatch);}
  if(f.highlight&&f.highlight!=='other')keep(format,'highlight',f.highlight,checkFormatPatch);
 }
 if(p){
  for(const k of PARA_VALUES){const v=p[k];if(v!==null&&v!==undefined)keep(para,k,v,checkParaPatch);}
  if(p.lineRule)keep(para,'lineRule',p.lineRule,checkParaPatch);
  else if(p.lineSpacing!=null)keep(para,'lineRule',{rule:'multiple',value:p.lineSpacing},checkParaPatch);
  if(p.tabs)keep(para,'tabs',p.tabs,checkParaPatch);
 }
 return{format,para};
}
export const paintIsEmpty=(x:Painted|null):boolean=>!x||(Object.keys(x.format).length===0&&Object.keys(x.para).length===0);
