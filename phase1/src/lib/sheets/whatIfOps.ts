import type {ScenarioInfo,WhatIfOp} from './protocol';
/** What-if analysis (goal seek, scenarios, data tables): validation of untrusted command input. The Rust bridge and the engine re-validate every field. */
export const MAX_WHATIF_REFS=200,MAX_WHATIF_NAME=255,MAX_SCENARIO_VALUES=32,MAX_SCENARIOS=1000,MAX_TABLE_CELLS=100_000;
const CELL=/^[A-Za-z]{1,3}[1-9][0-9]{0,6}$/,CELLS=/^[A-Za-z]{1,3}[1-9][0-9]{0,6}(:[A-Za-z]{1,3}[1-9][0-9]{0,6})?(,[A-Za-z]{1,3}[1-9][0-9]{0,6}(:[A-Za-z]{1,3}[1-9][0-9]{0,6})?)*$/,BLOCK=/^[A-Za-z]{1,3}[1-9][0-9]{0,6}:[A-Za-z]{1,3}[1-9][0-9]{0,6}$/;
const control=(v:string)=>/[\u0000-\u001f\u007f]/.test(v);
export const cellProblem=(v:unknown)=>typeof v!=='string'||!CELL.test(v.trim());
const oneCell=(v:unknown,what:string)=>{if(cellProblem(v))throw Error(`${what} must be one cell like B2.`);return (v as string).trim().toUpperCase();};
const cells=(v:unknown,what:string)=>{if(typeof v!=='string'||v.length>MAX_WHATIF_REFS||!CELLS.test(v.trim()))throw Error(`${what} must be cells like B2:B4 or B2,B4.`);return v.trim().toUpperCase();};
const nameOf=(v:unknown)=>{if(typeof v!=='string'||v.trim()===''||[...v.trim()].length>MAX_WHATIF_NAME||control(v))throw Error('The scenario name must be 1 to 255 characters without control characters.');return v.trim();};
export function parseWhatIfCommand(input:unknown):WhatIfOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('What-if analysis must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown what-if field.');};
 switch(o.kind){
  case 'goalSeek':{only('kind','set','to','changing');if(typeof o.to!=='number'||!Number.isFinite(o.to))throw Error('The target must be a number.');return {kind:'goalSeek',set:oneCell(o.set,'The formula cell'),to:o.to,changing:oneCell(o.changing,'The changing cell')};}
  case 'scenarioAdd':{only('kind','name','changing','values','comment','replace');const out:WhatIfOp={kind:'scenarioAdd',name:nameOf(o.name),changing:cells(o.changing,'The changing cells')};
   if(o.values!==undefined){if(!Array.isArray(o.values)||o.values.length>MAX_SCENARIO_VALUES||o.values.some(v=>!(v===null||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))||(typeof v==='string'&&[...v].length<=255&&!control(v)))))throw Error('Scenario values must be numbers, text, true or false.');out.values=o.values as (string|number|boolean|null)[];}
   if(o.comment!==undefined){if(typeof o.comment!=='string'||[...o.comment].length>255||control(o.comment))throw Error('The comment is too long or has control characters.');out.comment=o.comment;}
   if(o.replace!==undefined){if(typeof o.replace!=='boolean')throw Error('`replace` must be true or false.');out.replace=o.replace;}
   return out;}
  case 'scenarioShow':case 'scenarioDelete':only('kind','name');return {kind:o.kind,name:nameOf(o.name)};
  case 'scenarioSummary':{only('kind','resultCells');return o.resultCells===undefined?{kind:'scenarioSummary'}:{kind:'scenarioSummary',resultCells:cells(o.resultCells,'The result cells')};}
  case 'dataTable':{only('kind','range','rowInput','columnInput');if(typeof o.range!=='string'||!BLOCK.test(o.range.trim()))throw Error('The table must be one block like D2:F10.');
   if(o.rowInput===undefined&&o.columnInput===undefined)throw Error('Give a row input cell, a column input cell or both.');
   const out:WhatIfOp={kind:'dataTable',range:o.range.trim().toUpperCase()};if(o.rowInput!==undefined)out.rowInput=oneCell(o.rowInput,'The row input');if(o.columnInput!==undefined)out.columnInput=oneCell(o.columnInput,'The column input');return out;}
  default:throw Error('Unsupported what-if operation.');
 }
}
/** Parses the bridge's scenario list defensively; at most 1000 entries. */
export function parseScenarios(raw:unknown):ScenarioInfo[]{
 const list=(raw as {scenarios?:unknown})?.scenarios;if(!Array.isArray(list))return [];
 return list.slice(0,MAX_SCENARIOS).flatMap(x=>{const r=x as Record<string,unknown>|null;
  if(!r||typeof r.name!=='string'||typeof r.changing!=='string')return [];
  return [{name:r.name.slice(0,MAX_WHATIF_NAME),changing:r.changing.slice(0,MAX_WHATIF_REFS),comment:typeof r.comment==='string'?r.comment.slice(0,255):'',values:Array.isArray(r.values)?r.values.slice(0,MAX_SCENARIO_VALUES).map(v=>typeof v==='number'||typeof v==='boolean'?String(v):typeof v==='string'?v.slice(0,255):''):[]}];});
}
/** The goal-seek outcome the bridge reports, bounded for display. */
export function parseGoalResult(raw:unknown):{value:number;converged:boolean}|null{
 const r=raw as Record<string,unknown>|null;if(!r||typeof r!=='object'||typeof r.value!=='number'||!Number.isFinite(r.value))return null;
 return {value:r.value,converged:r.converged===true};
}
/** The panel's single action choice. */
export const WHATIF_ACTIONS=['goalSeek','scenarioAdd','scenarioReplace','scenarioShow','scenarioDelete','scenarioSummary','tableColumn','tableRow','tableBoth'] as const;
export type WhatIfAction=typeof WHATIF_ACTIONS[number];
export const WHATIF_GROUPS:readonly (readonly [string,readonly WhatIfAction[]])[]=[['goal',['goalSeek']],['scenarios',['scenarioAdd','scenarioReplace','scenarioShow','scenarioDelete','scenarioSummary']],['tables',['tableColumn','tableRow','tableBoth']]];
export interface WhatIfFields{set:string;to:string;changing:string;name:string;pick:string;results:string;rowInput:string;columnInput:string;selection:string;selectionCells:number}
export const whatIfNeeds=(a:WhatIfAction)=>({set:a==='goalSeek',to:a==='goalSeek',changing:a==='goalSeek',name:a==='scenarioAdd'||a==='scenarioReplace',pick:a==='scenarioShow'||a==='scenarioDelete',results:a==='scenarioSummary',rowInput:a==='tableRow'||a==='tableBoth',columnInput:a==='tableColumn'||a==='tableBoth'});
/** Builds the op for the panel; null while the inputs are incomplete or invalid. */
export function buildWhatIfOp(a:WhatIfAction,f:WhatIfFields):WhatIfOp|null{
 try{
  switch(a){
   case 'goalSeek':{const n=f.to.trim()===''?NaN:Number(f.to.trim().replace(/,/g,'.'));return parseWhatIfCommand({kind:'goalSeek',set:f.set,to:n,changing:f.changing});}
   case 'scenarioAdd':case 'scenarioReplace':if(f.selectionCells<1||f.selectionCells>MAX_SCENARIO_VALUES)return null;return parseWhatIfCommand({kind:'scenarioAdd',name:f.name,changing:f.selection,replace:a==='scenarioReplace'});
   case 'scenarioShow':case 'scenarioDelete':return parseWhatIfCommand({kind:a,name:f.pick});
   case 'scenarioSummary':return parseWhatIfCommand(f.results.trim()===''?{kind:'scenarioSummary'}:{kind:'scenarioSummary',resultCells:f.results});
   default:{if(f.selectionCells<4||f.selectionCells>MAX_TABLE_CELLS+1_000)return null;return parseWhatIfCommand({kind:'dataTable',range:f.selection,...(a!=='tableRow'?{columnInput:f.columnInput}:{}),...(a!=='tableColumn'?{rowInput:f.rowInput}:{})});}
  }
 }catch{return null;}
}
