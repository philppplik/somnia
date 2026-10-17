import {MAX_FILTER_PICKS} from './filterOps';

/** Period granularity of the filter timeline. Calendar quarters only; fiscal years are out of scope. */
export type TimelineGranularity='year'|'quarter'|'month'|'day';
export interface TimelineBucket{
 /** Chronological sort key, e.g. 2026, 2026*3, 2026*100+7, serial day number. */
 key:number;
 /** Locale-formatted period label. */
 label:string;
 /** Rows in the scanned column falling into this period. */
 count:number;
 /** Period bounds as 1900-system serials, half-open [from,to). Ready for a future range op. */
 from:number;
 to:number;
 /** Distinct plain-number texts (String(serial)) of the period - the kind:'values' apply payload. */
 values:string[];
}
export interface TimelineScan{
 buckets:TimelineBucket[];
 /** Empty cells in the scanned column. */
 blanks:number;
 /** Bucketed date cells; 0 means the column holds no date values. */
 dates:number;
 /** True when the period list hit MAX_TIMELINE_PERIODS and later periods are not shown. */
 truncated:boolean;
}
/** Bound: the period list shows at most this many buckets; the rest is flagged, never dropped silently. */
export const MAX_TIMELINE_PERIODS=500;
/** Serials below this are times without a date (or the 1900 leap bug); they are not bucketed. */
const MIN_DATE_SERIAL=1,MS_PER_DAY=86_400_000,EPOCH=25569; // 1900 system, same as clock.ts

/** Inverse of clock.ts localSerial: date fields of a 1900-system serial, UTC-safe. Null outside the valid range. */
export function serialToYMD(serial:number):{y:number;m:number;d:number}|null{
 if(!Number.isFinite(serial))return null;
 const ms=Math.round((serial-EPOCH)*MS_PER_DAY);
 const d=new Date(ms);
 if(Number.isNaN(d.getTime()))return null;
 const ymd={y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};
 // Round-trip guard against the Date range edges.
 return ymd.y>=1900&&ymd.y<=9999?ymd:null;
}
const serialOf=(y:number,m0:number,d:number):number=>EPOCH+Date.UTC(y,m0,d)/MS_PER_DAY;

/**
 * Honest date-format heuristic: strips bracketed sections ([$-F800], [Red], conditions)
 * and quoted literals, then looks for date/time tokens (y, m, d, h). Plain numeric
 * formats (0.00, #,##0, 0%, 0.00E+00, @) carry none. Can miss exotic custom codes -
 * the timeline then reports "no date values found" instead of guessing a filter.
 */
export function isDateFmt(fmt:string):boolean{
 const stripped=fmt.replace(/\[[^\]]*\]/g,'').replace(/"[^"]*"/g,'').replace(/\\./g,'').replace(/_.|\*./g,'');
 return /[ymdh]/i.test(stripped);
}

function bucketKey(ymd:{y:number;m:number;d:number},g:TimelineGranularity):number{
 switch(g){
  case 'year':return ymd.y;
  case 'quarter':return ymd.y*10+Math.floor((ymd.m-1)/3)+1;
  case 'month':return ymd.y*100+ymd.m;
  case 'day':return Math.floor(serialOf(ymd.y,ymd.m-1,ymd.d));
 }
}
function bucketBounds(ymd:{y:number;m:number;d:number},g:TimelineGranularity):{from:number;to:number}{
 switch(g){
  case 'year':return {from:serialOf(ymd.y,0,1),to:serialOf(ymd.y+1,0,1)};
  case 'quarter':{const q0=Math.floor((ymd.m-1)/3)*3;return {from:serialOf(ymd.y,q0,1),to:serialOf(ymd.y,q0+3,1)};}
  case 'month':return {from:serialOf(ymd.y,ymd.m-1,1),to:serialOf(ymd.y,ymd.m,1)};
  case 'day':{const from=serialOf(ymd.y,ymd.m-1,ymd.d);return {from,to:from+1};}
 }
}
function bucketLabel(ymd:{y:number;m:number;d:number},g:TimelineGranularity,monthNames:readonly string[],dayFmt:Intl.DateTimeFormat):string{
 switch(g){
  case 'year':return String(ymd.y);
  case 'quarter':return ymd.y+' Q'+(Math.floor((ymd.m-1)/3)+1);
  case 'month':return monthNames[ymd.m-1]+' '+ymd.y;
  case 'day':return dayFmt.format(new Date(Date.UTC(ymd.y,ymd.m-1,ymd.d)));
 }
}

/**
 * Buckets date serials of one scanned column into periods, chronological, capped at
 * MAX_TIMELINE_PERIODS. `serials` holds one entry per date cell (Number value of a
 * cell whose format isDateFmt accepted); blanks counts the empty cells of the column.
 * Locale only shapes labels, never the bounds.
 */
export function bucketDates(serials:readonly number[],granularity:TimelineGranularity,blanks:number,locale:string):TimelineScan{
 let monthNames:string[]=[];
 try{const f=new Intl.DateTimeFormat(locale,{month:'long',timeZone:'UTC'});monthNames=Array.from({length:12},(_,i)=>f.format(new Date(Date.UTC(2024,i,1))));}catch{monthNames=Array.from({length:12},(_,i)=>String(i+1));}
 let dayFmt:Intl.DateTimeFormat;
 try{dayFmt=new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'});}catch{dayFmt=new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'});}
 const map=new Map<number,{ymd:{y:number;m:number;d:number};count:number;values:Set<string>}>();
 let dates=0;
 for(const s of serials){
  if(!Number.isFinite(s)||s<MIN_DATE_SERIAL)continue;
  const ymd=serialToYMD(s);if(!ymd)continue;
  dates++;
  const key=bucketKey(ymd,granularity);
  let b=map.get(key);if(!b){b={ymd,count:0,values:new Set()};map.set(key,b);}
  b.count++;b.values.add(String(s));
 }
 const keys=[...map.keys()].sort((a,b)=>a-b);
 const truncated=keys.length>MAX_TIMELINE_PERIODS;
 const buckets=keys.slice(0,MAX_TIMELINE_PERIODS).map(key=>{
  const b=map.get(key)!,{from,to}=bucketBounds(b.ymd,granularity);
  return {key,label:bucketLabel(b.ymd,granularity,monthNames,dayFmt),count:b.count,from,to,values:[...b.values]};
 });
 return {buckets,blanks,dates,truncated};
}

/** Path A gate: a period (or a picked set of periods) applies as kind:'values' only within the 200-pick bound. */
export const periodsFitValues=(buckets:readonly TimelineBucket[]):boolean=>new Set(buckets.flatMap(b=>b.values)).size<=MAX_FILTER_PICKS;
/** The combined kind:'values' payload of the picked periods (distinct, insertion order). */
export const pickedPeriodValues=(buckets:readonly TimelineBucket[]):string[]=>[...new Set(buckets.flatMap(b=>b.values))];

/** The bucket holding a serial (usually "now"), or null when no shown period contains it. */
export const currentPeriod=(buckets:readonly TimelineBucket[],serial:number):TimelineBucket|null=>buckets.find(b=>serial>=b.from&&serial<b.to)??null;
