import type {PivotEditOp,PivotReport} from './protocol';
/** PivotTable editing: validation of untrusted command input and of bridge answers. The Rust bridge re-validates. */
export const PIVOT_AREAS=['rows','columns','values','filters'] as const;
export const PIVOT_VALUE_FUNCS=['sum','count','average','max','min','product','countNumbers','stdDev','stdDevP','var','varP'] as const;
export const PIVOT_SHOW_AS=['normal','percentOfGrandTotal','percentOfColumnTotal','percentOfRowTotal','runningTotal','rank'] as const;
export const PIVOT_NUMBER_FORMATS=['#,##0','#,##0.00','0%','0.00%'] as const;
export const PIVOT_LAYOUTS=['compact','outline','tabular'] as const;
export const PIVOT_SUBTOTALS=['none','top','bottom'] as const;
export const PIVOT_GROUPS=['years','quarters','months','days','none'] as const;
export const PIVOT_ORDERS=['asc','desc','none'] as const;
export const PIVOT_STYLES=['PivotStyleLight16','PivotStyleLight1','PivotStyleMedium2','PivotStyleMedium9','PivotStyleDark2'] as const;
export const MAX_PIVOT_ITEMS=200,MAX_PIVOT_TEXT=255,MAX_PIVOT_REPORTS=10,MAX_PIVOT_REPORT_FIELDS=200;
const bad=(v:unknown)=>typeof v!=='string'||v===''||[...v].length>MAX_PIVOT_TEXT||/[\u0000-\u001f\u007f]/.test(v);
const oneOf=<T extends readonly string[]>(list:T,v:unknown,what:string):T[number]=>{if(typeof v!=='string'||!list.includes(v))throw Error(what+' is not supported.');return v;};
const STYLE=/^PivotStyle(Light|Medium|Dark)[0-9]{1,2}$/;
export function parsePivotEditCommand(input:unknown):PivotEditOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('PivotTable operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!['kind','pivot',...k].includes(x)))throw Error('Unknown PivotTable field.');};
 const text=(k:string)=>{if(bad(o[k]))throw Error(k+' is missing or invalid.');return o[k] as string;};
 const pivot=text('pivot');
 switch(o.kind){
  case 'addField':{only('field','area','func');const out:PivotEditOp={kind:'addField',pivot,field:text('field'),area:oneOf(PIVOT_AREAS,o.area,'area')};if(o.func!==undefined)out.func=oneOf(PIVOT_VALUE_FUNCS,o.func,'func');return out;}
  case 'removeField':only('field','area');return {kind:'removeField',pivot,field:text('field'),area:oneOf(PIVOT_AREAS,o.area,'area')};
  case 'moveField':only('field','from','to');return {kind:'moveField',pivot,field:text('field'),from:oneOf(PIVOT_AREAS,o.from,'from'),to:oneOf(PIVOT_AREAS,o.to,'to')};
  case 'valueSettings':{only('index','func','showAs','numberFormat');if(!Number.isInteger(o.index)||(o.index as number)<0||(o.index as number)>=64)throw Error('index must be a value position.');
   const out:PivotEditOp={kind:'valueSettings',pivot,index:o.index as number};
   if(o.func!==undefined)out.func=oneOf(PIVOT_VALUE_FUNCS,o.func,'func');if(o.showAs!==undefined)out.showAs=oneOf(PIVOT_SHOW_AS,o.showAs,'showAs');
   if(o.numberFormat!==undefined)out.numberFormat=o.numberFormat===null?null:oneOf(PIVOT_NUMBER_FORMATS,o.numberFormat,'numberFormat');
   if(out.func===undefined&&out.showAs===undefined&&out.numberFormat===undefined)throw Error('Change the function, the display or the number format.');return out;}
  case 'filter':{only('field','selected');const field=text('field');if(o.selected===null)return {kind:'filter',pivot,field,selected:null};
   if(!Array.isArray(o.selected)||o.selected.length<1||o.selected.length>MAX_PIVOT_ITEMS||o.selected.some(x=>typeof x!=='string'||[...x].length>MAX_PIVOT_TEXT||/[\u0000-\u001f\u007f]/.test(x)))throw Error('selected must be null or 1 to 200 item labels.');
   return {kind:'filter',pivot,field,selected:o.selected as string[]};}
  case 'sort':only('field','order');return {kind:'sort',pivot,field:text('field'),order:oneOf(PIVOT_ORDERS,o.order,'order')};
  case 'group':only('field','by');return {kind:'group',pivot,field:text('field'),by:oneOf(PIVOT_GROUPS,o.by,'by')};
  case 'collapse':only('field','collapse');if(typeof o.collapse!=='boolean')throw Error('collapse must be true or false.');return {kind:'collapse',pivot,field:text('field'),collapse:o.collapse};
  case 'layout':{only('layout','grandTotalsRows','grandTotalsCols','subtotals','showHeaders','style');const out:PivotEditOp={kind:'layout',pivot};
   if(o.layout!==undefined)out.layout=oneOf(PIVOT_LAYOUTS,o.layout,'layout');if(o.subtotals!==undefined)out.subtotals=oneOf(PIVOT_SUBTOTALS,o.subtotals,'subtotals');
   for(const k of ['grandTotalsRows','grandTotalsCols','showHeaders'] as const){if(o[k]!==undefined){if(typeof o[k]!=='boolean')throw Error(k+' must be true or false.');out[k]=o[k] as boolean;}}
   if(o.style!==undefined){if(typeof o.style!=='string'||!STYLE.test(o.style))throw Error('Unsupported PivotTable style.');out.style=o.style;}
   if(Object.keys(out).length===2)throw Error('Change at least one layout setting.');return out;}
  case 'changeSource':case 'refresh':case 'delete':only();return {kind:o.kind,pivot};
  default:throw Error('Unsupported PivotTable operation.');
 }
}
/** Why the selection cannot be the new source (null when it can). */
export function pivotSourceProblem(rows:number,cols:number):'small'|'large'|null{return rows<2||cols<1?'small':rows*cols>1_000_000?'large':null;}
const str=(v:unknown,n=255)=>typeof v==='string'?v.slice(0,n):'';
const area=(raw:unknown,keys:string[])=>Array.isArray(raw)?raw.slice(0,MAX_PIVOT_REPORT_FIELDS).map(x=>{const o=(x&&typeof x==='object'?x:{}) as Record<string,unknown>;return {field:str(o.field),...Object.fromEntries(keys.map(k=>[k,o[k]]))};}).filter(x=>x.field!==''):[];
/** The bridge's PivotTable list: closed shape, bounded text, anything else dropped. */
export function parsePivotReports(raw:unknown):PivotReport[]{
 const list=(raw&&typeof raw==='object'?(raw as {pivots?:unknown}).pivots:null);if(!Array.isArray(list))throw Error('Invalid PivotTable list.');
 return list.slice(0,MAX_PIVOT_REPORTS).map(p=>{const o=(p&&typeof p==='object'?p:{}) as Record<string,unknown>;
  const rows=area(o.rows,['sort','group','collapsed']),columns=area(o.columns,['sort','group','collapsed']),values=area(o.values,['func','name','showAs','numberFormat']),filters=area(o.filters,['selected','report']);
  const fields=Array.isArray(o.fields)?o.fields.slice(0,MAX_PIVOT_REPORT_FIELDS).map(f=>{const r=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;return {name:str(r.name),numeric:r.numeric===true,date:r.date===true,areas:Array.isArray(r.areas)?r.areas.filter((a):a is string=>typeof a==='string').slice(0,4):[]};}).filter(f=>f.name!==''):[];
  return {name:str(o.name),source:str(o.source),range:typeof o.range==='string'?o.range.slice(0,40):null,rows,columns,values,filters,layout:str(o.layout,16),grandTotalsRows:o.grandTotalsRows!==false,grandTotalsCols:o.grandTotalsCols!==false,subtotals:str(o.subtotals,8),style:str(o.style,40),showHeaders:o.showHeaders!==false,fields,records:typeof o.records==='number'?o.records:0};
 }).filter(p=>p.name!=='');
}
