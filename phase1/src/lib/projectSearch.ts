/** Project-wide search and replace over in-memory file texts. Pure functions, no I/O. */
export interface SearchOptions{regex:boolean;caseSensitive:boolean;wholeWord:boolean}
export interface SearchMatch{file:string;line:number;col:number;length:number;lineText:string}
export const MAX_MATCHES=2000;
export function buildPattern(query:string,o:SearchOptions):RegExp|{error:string}|null{
 if(!query)return null;let src=o.regex?query:query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(o.wholeWord)src=`\\b(?:${src})\\b`;
 try{const re=new RegExp(src,o.caseSensitive?'g':'gi');if(re.test(''))return{error:'Pattern matches empty text.'};re.lastIndex=0;return re;}catch(e){return{error:e instanceof Error?e.message:'Invalid pattern.'};}}
export function searchProject(files:Record<string,string>,query:string,o:SearchOptions):{matches:SearchMatch[];truncated:boolean;error?:string}{
 const re=buildPattern(query,o);if(!re)return{matches:[],truncated:false};if('error' in re)return{matches:[],truncated:false,error:re.error};
 const matches:SearchMatch[]=[];
 for(const file of Object.keys(files).sort()){const lines=files[file].split('\n');
  for(let i=0;i<lines.length;i++){re.lastIndex=0;let m:RegExpExecArray|null;while((m=re.exec(lines[i]))){matches.push({file,line:i+1,col:m.index+1,length:m[0].length,lineText:lines[i].slice(0,300)});if(matches.length>=MAX_MATCHES)return{matches,truncated:true};if(m[0].length===0)re.lastIndex++;}}}
 return{matches,truncated:false};}
/** Returns only files that change. `replacement` supports $1-style groups in regex mode and is literal otherwise. */
export function replaceInProject(files:Record<string,string>,query:string,replacement:string,o:SearchOptions,only?:Set<string>):{changed:Record<string,string>;count:number}{
 const re=buildPattern(query,o);const changed:Record<string,string>={};let count=0;if(!re||'error' in re)return{changed,count};
 for(const [file,text] of Object.entries(files)){if(only&&!only.has(file))continue;re.lastIndex=0;let n=0;const out=text.replace(re,(...a)=>{n++;return o.regex?expand(replacement,a):replacement;});if(n&&out!==text){changed[file]=out;count+=n;}}
 return{changed,count};}
function expand(rep:string,args:unknown[]):string{const groups=args.slice(0,-2).filter(x=>typeof x==='string') as string[];return rep.replace(/\$(\d{1,2}|&|\$)/g,(_,k:string)=>k==='$'?'$':k==='&'?groups[0]:(groups[Number(k)]??''));}
