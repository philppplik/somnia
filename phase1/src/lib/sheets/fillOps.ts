import type {FillDirection} from './protocol';
/** Fill down/right: validation for untrusted command input. The Rust bridge and the engine re-validate. */
export const MAX_FILL_CELLS=1_000_000;
export const FILL_DIRECTIONS:readonly FillDirection[]=['down','right','up','left'];
/** Why the selected block cannot be filled in this direction, or null. `row`/`col` are the block origin. */
export function fillBlockProblem(row:number,col:number,rows:number,cols:number,dir:FillDirection):'small'|'large'|'edge'|null{
 if(![row,col,rows,cols].every(Number.isInteger)||row<0||col<0||rows<1||cols<1)return 'small';
 if(rows*cols>MAX_FILL_CELLS)return 'large';
 const vertical=dir==='down'||dir==='up',span=vertical?rows:cols,start=vertical?row:col;
 if(span>=2)return null;
 return (dir==='down'||dir==='right')&&start>0?null:'edge';
}
export function parseFillCommand(input:unknown):{dir:FillDirection}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Fill must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='dir'))throw Error('Unknown fill field.');
 if(typeof o.dir!=='string'||!(FILL_DIRECTIONS as readonly string[]).includes(o.dir))throw Error('Fill direction must be down, right, up or left.');
 return {dir:o.dir as FillDirection};
}

export const MAX_AUTOFILL_COUNT=100_000;
export const AUTOFILL_MODES=['series','copy','formats','values'] as const;
export type AutoFillMode=typeof AUTOFILL_MODES[number];
export type AutoFillDir='down'|'up'|'right'|'left';
export interface AutoFillOp{dir:AutoFillDir;count:number;mode?:'copy'|'formats'|'values'}
const withMode=(mode:unknown):{mode?:'copy'|'formats'|'values'}=>mode==='copy'||mode==='formats'||mode==='values'?{mode}:{};
/** Fill-handle command input: continue the selection for `count` more rows or columns. The Rust bridge re-validates. */
export function parseAutoFillCommand(input:unknown):AutoFillOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Fill must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['dir','count','mode'].includes(k)))throw Error('Unknown fill field.');
 if(o.dir!=='down'&&o.dir!=='up'&&o.dir!=='right'&&o.dir!=='left')throw Error('Fill direction must be down, up, right or left.');
 if(typeof o.count!=='number'||!Number.isInteger(o.count)||o.count<1||o.count>MAX_AUTOFILL_COUNT)throw Error('Count must be 1 to 100000.');
 if(o.mode!==undefined&&!(AUTOFILL_MODES as readonly unknown[]).includes(o.mode))throw Error('Mode must be series, copy, formats or values.');
 return {dir:o.dir,count:o.count,...withMode(o.mode)};
}
/** Where a fill-handle drag ends: the cell under the pointer, compared with the selection. The longest pull past one edge wins (ties prefer down, right, up, left); null when the pointer is inside the selection or the pull is too big. */
export function fillDragOp(range:{r0:number;c0:number;r1:number;c1:number},to:{row:number;col:number},totalRows:number,totalCols:number,mode:AutoFillMode):AutoFillOp|null{
 const pulls:[AutoFillDir,number,number][]=[['down',to.row-range.r1,totalRows-1-range.r1],['right',to.col-range.c1,totalCols-1-range.c1],['up',range.r0-to.row,range.r0],['left',range.c0-to.col,range.c0]];
 let best:[AutoFillDir,number,number]|null=null;for(const p of pulls)if(p[1]>0&&(!best||p[1]>best[1]))best=p;
 if(!best)return null;
 const count=Math.min(best[1],best[2]);if(count<1||count>MAX_AUTOFILL_COUNT)return null;
 const lane=best[0]==='down'||best[0]==='up'?range.c1-range.c0+1:range.r1-range.r0+1;if(count*lane>MAX_FILL_CELLS)return null;
 return {dir:best[0],count,...withMode(mode)};
}

export const SERIES_KINDS=['linear','growth','day','weekday','month','year'] as const;
export type SeriesKind=typeof SERIES_KINDS[number];
export interface SeriesOp{axis:'down'|'right';kind:'linear'|'growth'|'date';step:number;stop?:number;unit?:'day'|'weekday'|'month'|'year'}
export type SeriesProblem='small'|'large'|'step'|'stop'|'whole'|'growth';
/** Series dialog input: one kind choice (linear, growth or a date unit), a step and an optional stop value. */
export function buildSeriesOp(rows:number,cols:number,kind:SeriesKind,step:number,stop:number|null):SeriesOp|SeriesProblem{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1)return 'small';
 if(rows*cols>MAX_FILL_CELLS)return 'large';
 const axis=rows>=cols?'down':'right';if((axis==='down'?rows:cols)<2)return 'small';
 if(!Number.isFinite(step)||step===0||Math.abs(step)>1e12)return 'step';
 const date=kind!=='linear'&&kind!=='growth';
 if((kind==='weekday'||kind==='month'||kind==='year')&&!Number.isInteger(step))return 'whole';
 if(kind==='growth'&&step<0)return 'growth';
 if(stop!==null&&(!Number.isFinite(stop)||Math.abs(stop)>1e15||date||(kind==='growth'&&step<=1)))return 'stop';
 return {axis,kind:date?'date':kind,step,...(stop!==null?{stop}:{}),...(date?{unit:kind as 'day'|'weekday'|'month'|'year'}:{})};
}
/** Series command input, validated like buildSeriesOp; the Rust bridge checks again, including the first cells. */
export function parseSeriesCommand(input:unknown):SeriesOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Series must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['axis','kind','step','stop','unit'].includes(k)))throw Error('Unknown series field.');
 if(o.axis!=='down'&&o.axis!=='right')throw Error('Axis must be down or right.');
 if(o.kind!=='linear'&&o.kind!=='growth'&&o.kind!=='date')throw Error('Kind must be linear, growth or date.');
 if(typeof o.step!=='number'||!Number.isFinite(o.step)||o.step===0||Math.abs(o.step)>1e12)throw Error('Step must be a number other than 0.');
 const unit=o.unit;if(unit!==undefined&&(o.kind!=='date'||!['day','weekday','month','year'].includes(unit as string)))throw Error('Unit goes with dates: day, weekday, month or year.');
 if(o.kind==='date'&&unit===undefined)throw Error('A date series needs a unit.');
 if((unit==='weekday'||unit==='month'||unit==='year')&&!Number.isInteger(o.step))throw Error('This unit needs a whole step.');
 if(o.kind==='growth'&&o.step<0)throw Error('The growth factor must be above 0.');
 let stop:number|undefined;
 if(o.stop!==undefined){if(typeof o.stop!=='number'||!Number.isFinite(o.stop)||Math.abs(o.stop)>1e15)throw Error('Stop must be a number.');if(o.kind==='date'||(o.kind==='growth'&&o.step<=1))throw Error('A stop value needs a linear series or a growth factor above 1.');stop=o.stop;}
 return {axis:o.axis,kind:o.kind,step:o.step,...(stop!==undefined?{stop}:{}),...(unit!==undefined?{unit:unit as SeriesOp['unit']}:{})};
}
