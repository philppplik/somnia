import type {CfFlag,CfOp,CfOperator,CfScale,CfStyle,CfTextMode} from './protocol';
/** Highlight rules: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const CF_STYLES:readonly CfStyle[]=['lightRed','yellow','green','redText'];
export const CF_SCALES:readonly CfScale[]=['greenYellowRed','redYellowGreen','whiteBlue','whiteRed'];
export const CF_OPERATORS:readonly CfOperator[]=['greater','less','equal','notEqual','greaterOrEqual','lessOrEqual','between','notBetween'];
export const CF_FLAGS:readonly CfFlag[]=['blanks','noBlanks','errors','noErrors','duplicate','unique','aboveAverage','belowAverage'];
export const CF_TEXT_MODES:readonly CfTextMode[]=['contains','notContains','beginsWith','endsWith'];
export const MAX_CF_TEXT=255,MAX_CF_RANK=1000,MAX_CF_CELLS=1_000_000;
const textProblem=(v:string)=>v.length===0||[...v].length>MAX_CF_TEXT||/[\u0000-\u001f\u007f]/.test(v);
const oneOf=<T extends string>(list:readonly T[],v:unknown,what:string):T=>{if(typeof v!=='string'||!(list as readonly string[]).includes(v))throw Error(`Unsupported ${what}.`);return v as T;};
const value=(v:unknown,what:string):string|number=>{if(typeof v==='number'){if(!Number.isFinite(v))throw Error(`Invalid ${what}.`);return v;}if(typeof v!=='string'||textProblem(v))throw Error(`Invalid ${what}.`);return v;};
export function parseCfCommand(input:unknown):CfOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Rule must be an object.');
 const o=input as Record<string,unknown>;const only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown rule field.');};
 switch(o.kind){
  case 'cell':{only('kind','operator','value','value2','style');const operator=oneOf(CF_OPERATORS,o.operator,'comparison'),style=oneOf(CF_STYLES,o.style,'style'),two=operator==='between'||operator==='notBetween';
   if(two!==(o.value2!==undefined))throw Error(two?'Between needs two values.':'Only between takes two values.');
   const out:CfOp={kind:'cell',operator,value:value(o.value,'value'),style};if(two)out.value2=value(o.value2,'second value');return out;}
  case 'text':{only('kind','mode','text','style');if(typeof o.text!=='string'||textProblem(o.text))throw Error('Invalid rule text.');return {kind:'text',mode:oneOf(CF_TEXT_MODES,o.mode,'text rule'),text:o.text,style:oneOf(CF_STYLES,o.style,'style')};}
  case 'flag':only('kind','flag','style');return {kind:'flag',flag:oneOf(CF_FLAGS,o.flag,'rule'),style:oneOf(CF_STYLES,o.style,'style')};
  case 'top':{only('kind','rank','bottom','percent','style');if(typeof o.rank!=='number'||!Number.isInteger(o.rank)||o.rank<1||o.rank>MAX_CF_RANK)throw Error('Rank must be 1 to 1000.');if(typeof o.bottom!=='boolean'||typeof o.percent!=='boolean')throw Error('Invalid top rule.');if(o.percent&&o.rank>100)throw Error('A percentage is at most 100.');return {kind:'top',rank:o.rank,bottom:o.bottom,percent:o.percent,style:oneOf(CF_STYLES,o.style,'style')};}
  case 'scale':only('kind','scale');return {kind:'scale',scale:oneOf(CF_SCALES,o.scale,'color scale')};
  case 'clear':case 'clearAll':only('kind');return {kind:o.kind};
  default:throw Error('Unsupported rule kind.');}
}
/** The panel's single rule choice. */
export const CF_CHOICES=['greater','less','equal','between','contains','beginsWith','endsWith','duplicate','unique','blanks','errors','aboveAverage','belowAverage','top','bottom','scaleGreenRed','scaleRedGreen','scaleBlue'] as const;
export type CfChoice=typeof CF_CHOICES[number];
export const cfChoiceNeeds=(c:CfChoice):'none'|'one'|'two'|'text'|'rank'=>c==='between'?'two':c==='contains'||c==='beginsWith'||c==='endsWith'?'text':c==='greater'||c==='less'||c==='equal'?'one':c==='top'||c==='bottom'?'rank':'none';
const numeric=(v:string)=>v.trim()!==''&&Number.isFinite(Number(v.replace(/,/g,'')))?Number(v.replace(/,/g,'')):v;
/** Builds the op for the panel; returns null while the inputs are incomplete or invalid. */
export function buildCfOp(choice:CfChoice,a:string,b:string,style:CfStyle,blockCells:number):CfOp|null{
 if(!Number.isInteger(blockCells)||blockCells<1||blockCells>MAX_CF_CELLS)return null;
 const need=cfChoiceNeeds(choice);
 try{
  if(need==='one')return parseCfCommand({kind:'cell',operator:choice,value:numeric(a),style});
  if(need==='two')return parseCfCommand({kind:'cell',operator:'between',value:numeric(a),value2:numeric(b),style});
  if(need==='text')return parseCfCommand({kind:'text',mode:choice,text:a,style});
  if(need==='rank'){const n=Number(a);return parseCfCommand({kind:'top',rank:n,bottom:choice==='bottom',percent:false,style});}
  if(choice==='duplicate'||choice==='unique'||choice==='blanks'||choice==='errors'||choice==='aboveAverage'||choice==='belowAverage')return parseCfCommand({kind:'flag',flag:choice,style});
  return parseCfCommand({kind:'scale',scale:choice==='scaleGreenRed'?'redYellowGreen':choice==='scaleRedGreen'?'greenYellowRed':'whiteBlue'});
 }catch{return null;}
}
