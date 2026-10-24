/**
 * CSV/TSV import for the Sheets studio. Pure and unit-tested; no DOM, no engine.
 *
 * The parser follows RFC 4180 (quoted fields, doubled quotes, CRLF or LF) with a tab
 * variant for TSV. The engine never sees the file text: the dialog turns it into
 * rectangular blocks of cell inputs that go through the same `setValues` path as a
 * paste (engine cap: 10,000 cells per call), so large files are written in row bands.
 * Values are typed inputs, like a paste: numbers and booleans become real values; a
 * field starting with `=` is escaped to text the way Excel's CSV import keeps it.
 */
import {MAX_CELL_BYTES} from './protocol';
import {MAX_ROWS,MAX_COLS} from './format';

/** Hard limits so a hostile or broken file cannot stall the studio. */
export const MAX_IMPORT_BYTES=32*1024*1024;
export const MAX_IMPORT_ROWS=100_000;
export const MAX_IMPORT_COLS=1000;
/** Engine `set_values` block cap. */
export const MAX_BLOCK_CELLS=10_000;

export type Delimiter='comma'|'semicolon'|'tab';
export const DELIMITERS:readonly Delimiter[]=['comma','semicolon','tab'];
const DELIM_CHAR:Record<Delimiter,string>={comma:',',semicolon:';',tab:'\t'};
export const delimiterChar=(d:Delimiter):string=>DELIM_CHAR[d]??',';

export type ImportProblem='empty'|'tooLarge'|'tooManyCells'|'tooLong';
export const IMPORT_PROBLEMS:readonly ImportProblem[]=['empty','tooLarge','tooManyCells','tooLong'];

/** Reads a delimited file as UTF-8, falling back to Windows-1252 (Excel's CSV default in Western locales). A UTF-8 BOM is stripped. */
export function decodeDelimitedFile(bytes:Uint8Array):{text:string;encoding:'utf-8'|'windows-1252'}{
 const bom=bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf?3:0;
 try{return{text:new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(bom)),encoding:'utf-8'};}
 catch{return{text:new TextDecoder('windows-1252').decode(bytes),encoding:'windows-1252'};}
}

/** Parses delimited text into rows of fields. A lone trailing newline ends the last row. */
export function parseDelimited(text:string,delimiter:Delimiter):string[][]{
 const d=delimiterChar(delimiter);
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,i=0;
 const endRow=()=>{row.push(field);field='';rows.push(row);row=[];};
 while(i<text.length){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}quoted=false;i++;continue;}field+=ch;i++;continue;}
  if(ch==='"'&&field===''){quoted=true;i++;continue;}
  if(ch===d){row.push(field);field='';i++;continue;}
  if(ch==='\r'){if(text[i+1]==='\n')i++;endRow();i++;continue;}
  if(ch==='\n'){endRow();i++;continue;}
  field+=ch;i++;}
 if(field!==''||row.length>0)endRow();
 return rows;
}

/**
 * Picks the most likely delimiter: the candidate with the most columns whose per-line
 * field count is consistent across the sample wins; ties prefer tab, then semicolon,
 * then comma (European decimal-comma CSVs are usually semicolon-separated).
 */
export function sniffDelimiter(text:string):Delimiter{
 const sample=text.slice(0,64*1024).split(/\r\n|\n|\r/).filter(l=>l.length>0).slice(0,50);
 if(!sample.length)return 'comma';
 let best:Delimiter='comma',bestScore=0;
 for(const cand of ['tab','semicolon','comma'] as const){
  const d=delimiterChar(cand);
  const counts=sample.map(l=>{
   let n=1,q=false;
   for(let i=0;i<l.length;i++){const c=l[i];if(q){if(c==='"'){if(l[i+1]==='"'){i++;continue;}q=false;}continue;}if(c==='"'){q=true;continue;}if(c===d)n++;}
   return n;
  });
  const mode=counts.reduce((m,c)=>{m.set(c,(m.get(c)??0)+1);return m;},new Map<number,number>());
  let consistent=0,cols=0;
  for(const [c,n] of mode)if(n>consistent||(n===consistent&&c>cols)){consistent=n;cols=c;}
  const score=cols>1?consistent*1000+cols:0;
  if(score>bestScore){bestScore=score;best=cand;}
 }
 return best;
}

/** A safe sheet name from a file name: no Excel-forbidden characters, at most 31 chars, never empty. */
export function importSheetName(file:string,existing:readonly string[]):string{
 const base=file.replace(/^.*[\\/]/,'').replace(/\.[^.]*$/,'').replace(/[[\]\\/*?:]/g,' ').trim().slice(0,28)||'Import';
 const taken=new Set(existing.map(n=>n.toLocaleLowerCase()));
 if(!taken.has(base.toLocaleLowerCase()))return base;
 for(let i=2;i<100;i++){const cand=`${base} (${i})`;if(!taken.has(cand.toLocaleLowerCase()))return cand;}
 return base;
}

/** Excel CSV semantics: a field that would be read as a formula stays text. */
export const escapeCellInput=(v:string):string=>v.startsWith('=')?"'"+v:v;

export interface ImportChunk{rowOffset:number;values:string[][]}
export type ImportTarget={kind:'newSheet';name:string}|{kind:'cell'};

export interface ImportPlan{chunks:ImportChunk[];rows:number;cols:number;truncated:boolean}
export type ImportResult={ok:true;plan:ImportPlan}|{ok:false;reason:ImportProblem};

/**
 * Turns file text into validated write blocks for a top-left anchored write on a new
 * sheet (origin 0,0) or at the active cell. Short rows are padded; every field obeys
 * the cell byte limit; the block is clipped to the sheet and to the import caps and
 * split into engine-sized row bands. Nothing is partially planned.
 */
export function planImport(text:string,delimiter:Delimiter,origin:{row:number;col:number}={row:0,col:0}):ImportResult{
 if(new TextEncoder().encode(text).length>MAX_IMPORT_BYTES)return {ok:false,reason:'tooLarge'};
 if(!Number.isInteger(origin.row)||!Number.isInteger(origin.col)||origin.row<0||origin.col<0||origin.row>=MAX_ROWS||origin.col>=MAX_COLS)return {ok:false,reason:'tooManyCells'};
 const data=parseDelimited(text,delimiter);
 if(!data.length||Math.max(...data.map(r=>r.length))===0)return {ok:false,reason:'empty'};
 let truncated=false;
 const rows=Math.min(data.length,MAX_IMPORT_ROWS,MAX_ROWS-origin.row);
 const cols=Math.min(Math.max(...data.map(r=>r.length)),MAX_IMPORT_COLS,MAX_COLS-origin.col);
 if(data.length>rows||Math.max(...data.map(r=>r.length))>cols)truncated=true;
 if(rows<1||cols<1)return {ok:false,reason:'tooManyCells'};
 const enc=new TextEncoder();
 const values=Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>escapeCellInput(data[i]?.[j]??'')));
 for(const row of values)for(const v of row)if(enc.encode(v).length>MAX_CELL_BYTES)return {ok:false,reason:'tooLong'};
 // Split into rectangular row bands within the engine's per-call cell cap.
 const perChunk=Math.max(1,Math.floor(MAX_BLOCK_CELLS/cols));
 const chunks:ImportChunk[]=[];
 for(let r=0;r<rows;r+=perChunk)chunks.push({rowOffset:r,values:values.slice(r,r+perChunk)});
 return {ok:true,plan:{chunks,rows,cols,truncated}};
}

/** First `rows` lines of the block for the dialog preview, padded to the block width (at most `cols`). */
export function importPreview(plan:ImportPlan,rows:number,cols:number):string[][]{
 const width=Math.min(cols,plan.cols);
 return plan.chunks[0]?.values.slice(0,rows).map(r=>r.slice(0,width))??[];
}
