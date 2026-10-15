import type {ExportOp,ExportResult,PageInfo,PageSetupOp} from './protocol';
/** Page setup and file export: validation of untrusted command input and of bridge answers. The Rust bridge re-validates. */
export const PAPERS=['Letter','Legal','A4','A3','A5','Tabloid','Executive'] as const;
export const MAX_HEADER_CHARS=100,MAX_PRINT_CELLS=1_000_000,MAX_EXPORT_BYTES=40*1024*1024;
const KEYS=['orientation','paper','margins','scale','fitWidth','fitHeight','centerH','centerV','gridlines','headings','header','footer','printArea','titleRows','titleCols','addRowBreak','addColBreak','removeRowBreak','removeColBreak','clearBreaks'];
const BOOLS=['centerH','centerV','gridlines','headings'] as const;
/** true when header or footer text is too long, has control characters or uses an `&` code the printer does not know. */
export function headerProblem(t:unknown):boolean{
 if(typeof t!=='string'||[...t].length>MAX_HEADER_CHARS||/[\u0000-\u001f\u007f]/.test(t))return true;
 return t.replace(/&[PNDTAFCLR&]/g,'').includes('&');
}
const areaOk=(v:unknown)=>typeof v==='string'&&/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/.test(v.trim());
export function parsePageSetupCommand(input:unknown):PageSetupOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Page setup must be an object.');
 const o=input as Record<string,unknown>,keys=Object.keys(o);
 if(keys.length===0)throw Error('Name at least one setting.');
 if(keys.some(k=>!KEYS.includes(k)))throw Error('Unknown page setting.');
 if(o.scale!==undefined&&(o.fitWidth!==undefined||o.fitHeight!==undefined))throw Error('Choose a scale or fit to pages, not both.');
 const out:PageSetupOp={};
 const BRK=['addRowBreak','addColBreak','removeRowBreak','removeColBreak','clearBreaks'];
 if(keys.some(k=>BRK.includes(k))){
  if(keys.length!==1)throw Error('Change page breaks on their own.');
  const k=keys[0];
  if(k==='clearBreaks'){if(o[k]!==true)throw Error('`clearBreaks` must be true.');return {clearBreaks:true};}
  const lim=k.endsWith('RowBreak')?1048576:16384,v=o[k];
  if(typeof v!=='number'||!Number.isInteger(v)||v<2||v>lim)throw Error('A page break needs a row or column after the first.');
  return {[k]:v} as PageSetupOp;
 }
 if(o.orientation!==undefined){if(o.orientation!=='portrait'&&o.orientation!=='landscape')throw Error('Unsupported orientation.');out.orientation=o.orientation;}
 if(o.paper!==undefined){if(!(PAPERS as readonly unknown[]).includes(o.paper))throw Error('Unsupported paper size.');out.paper=o.paper as typeof PAPERS[number];}
 if(o.margins!==undefined){if(o.margins!=='normal'&&o.margins!=='wide'&&o.margins!=='narrow')throw Error('Unsupported margins.');out.margins=o.margins;}
 if(o.scale!==undefined){if(typeof o.scale!=='number'||!Number.isInteger(o.scale)||o.scale<10||o.scale>400)throw Error('Scale must be 10 to 400.');out.scale=o.scale;}
 for(const k of ['fitWidth','fitHeight'] as const)if(o[k]!==undefined){const n=o[k];if(typeof n!=='number'||!Number.isInteger(n)||n<0||n>20)throw Error('Pages must be 0 to 20.');out[k]=n;}
 for(const k of BOOLS)if(o[k]!==undefined){if(typeof o[k]!=='boolean')throw Error('`'+k+'` must be true or false.');out[k]=o[k] as boolean;}
 for(const k of ['header','footer'] as const)if(o[k]!==undefined){if(headerProblem(o[k]))throw Error('Header or footer text is not allowed.');out[k]=o[k] as string;}
 if(o.printArea!==undefined){if(o.printArea!==null&&!areaOk(o.printArea))throw Error('Print area must be a range like A1:F40.');out.printArea=o.printArea===null?null:(o.printArea as string).trim();}
 if(o.titleRows!==undefined){if(o.titleRows!==null&&!(typeof o.titleRows==='string'&&/^[0-9]{1,7}:[0-9]{1,7}$/.test(o.titleRows)))throw Error('Title rows must look like 1:2.');out.titleRows=o.titleRows as string|null;}
 if(o.titleCols!==undefined){if(o.titleCols!==null&&!(typeof o.titleCols==='string'&&/^[A-Za-z]{1,3}:[A-Za-z]{1,3}$/.test(o.titleCols)))throw Error('Title columns must look like A:B.');out.titleCols=o.titleCols===null?null:(o.titleCols as string).toUpperCase();}
 return out;
}
export function parseExportCommand(input:unknown):ExportOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Export must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['format','scope','fit'].includes(k)))throw Error('Unknown export field.');
 if(o.format!=='pdf'&&o.format!=='csv'&&o.format!=='tsv'&&o.format!=='html')throw Error('Unsupported export format.');
 const scope=o.scope===undefined?'sheet':o.scope;if(scope!=='sheet'&&scope!=='all'&&scope!=='selection')throw Error('Unsupported export scope.');
 if(o.fit!==undefined&&typeof o.fit!=='boolean')throw Error('`fit` must be true or false.');
 if(o.format!=='pdf'&&(scope!=='sheet'||o.fit===true))throw Error('Only PDF can export all sheets, the selection or fit to a page.');
 return {format:o.format,scope,...(o.fit===true?{fit:true}:{})};
}
export function parsePageInfo(raw:unknown):PageInfo|null{
 const r=raw as Record<string,unknown>|null;if(!r||typeof r!=='object')return null;
 const n=(v:unknown,d:number)=>typeof v==='number'&&Number.isFinite(v)?v:d,b=(v:unknown)=>v===true,s=(v:unknown)=>typeof v==='string'?v.slice(0,300):'',z=(v:unknown)=>typeof v==='string'?v.slice(0,40):null;
 const nums=(v:unknown)=>Array.isArray(v)?v.filter((x):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=2).slice(0,1026):[];
 return {orientation:r.orientation==='landscape'?'landscape':'portrait',paper:s(r.paper),margins:Array.isArray(r.margins)?r.margins.slice(0,6).map(x=>n(x,0)):[],scale:n(r.scale,100),fitWidth:n(r.fitWidth,0),fitHeight:n(r.fitHeight,0),centerH:b(r.centerH),centerV:b(r.centerV),gridlines:b(r.gridlines),headings:b(r.headings),header:s(r.header),footer:s(r.footer),printArea:z(r.printArea),titleRows:z(r.titleRows),titleCols:z(r.titleCols),rowBreaks:nums(r.rowBreaks),colBreaks:nums(r.colBreaks)};
}
export function parseExportResult(raw:unknown):ExportResult{
 const r=raw as Record<string,unknown>|null;
 if(!r||typeof r.base64!=='string'||r.base64===''||typeof r.format!=='string')throw Error('The export produced no file.');
 const bytes=typeof r.bytes==='number'?r.bytes:0;if(bytes>MAX_EXPORT_BYTES)throw Error('The export is too large.');
 return {format:r.format as ExportResult['format'],base64:r.base64,bytes,pages:typeof r.pages==='number'?r.pages:null};
}
