export interface QuickOpenQuery {text:string;line:number;column:number}
export interface QuickOpenRow {path:string;score:number}
export type QuickOpenResult={status:'ready';rows:QuickOpenRow[];matches:number;total:number;location:QuickOpenQuery}|{status:'budget'|'query';rows:readonly []};
export function parseQuickOpenQuery(query:string):QuickOpenQuery|null {
 if(query.length>256)return null;
 const trimmed=query.trim(),match=/^([^:]*):([0-9]+)(?::([0-9]+))?$/.exec(trimmed);
 if(!match)return trimmed.includes(':')?null:{text:trimmed,line:1,column:1};
 const line=Number(match[2]),column=Number(match[3]??1);if(!Number.isSafeInteger(line)||!Number.isSafeInteger(column)||line<1||column<1||line>10000000||column>10000000)return null;
 return {text:match[1].trim(),line,column};
}
function scorePath(path:string,needle:string):number|null {
 const text=path.toLowerCase(),name=text.slice(text.lastIndexOf('/')+1);
 if(!needle)return 0;
 if(name===needle)return 10000;
 if(text===needle)return 9500;
 if(name.startsWith(needle))return 9000-name.length;
 const direct=text.indexOf(needle);if(direct>=0)return 8000-direct-text.length;
 let last=-1,score=4000;for(const character of needle){const next=text.indexOf(character,last+1);if(next<0)return null;score-=next-last-1;if(next===0||'/._-'.includes(text[next-1]))score+=8;last=next;}
 return score-text.length;
}
/** Already-open project text paths only. No content search, filesystem access or regex evaluation. */
export function rankQuickOpen(paths:readonly string[],query:string,active:string):QuickOpenResult {
 if(paths.length>5000||paths.reduce((n,p)=>n+p.length,0)>512000)return {status:'budget',rows:[]};
 const location=parseQuickOpenQuery(query);if(!location)return {status:'query',rows:[]};
 const needle=location.text.toLowerCase(),rows:QuickOpenRow[]=[];
 for(const path of paths){const score=scorePath(path,needle);if(score!==null)rows.push({path,score:score+(path===active&&!needle?1:0)});}
 rows.sort((a,b)=>b.score-a.score||(a.path<b.path?-1:a.path>b.path?1:0));
 return {status:'ready',rows:rows.slice(0,100),matches:rows.length,total:paths.length,location};
}
