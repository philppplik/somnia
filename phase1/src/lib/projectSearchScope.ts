/** Small path glob matcher. No shell, filesystem, or regex execution. Paths are project-relative, case-sensitive. */
export interface ProjectSearchScope {include:string;exclude:string}
const parse=(input:string)=>{if(input.length>1024)throw Error('scope-limit');const patterns=input.split(',').map(x=>x.trim().replace(/^\.\//,'')).filter(Boolean);if(patterns.length>8||patterns.some(x=>x.length>256||x.includes('\\')||x.startsWith('/')||x.split('/').includes('..')))throw Error('scope-invalid');return patterns;};
export function matchesPathGlob(path:string,pattern:string):boolean {
 const text=pattern.includes('/')?path.replaceAll('\\','/'):path.replaceAll('\\','/').split('/').at(-1)!;
 const tokens:string[]=[];for(let i=0;i<pattern.length;i++){if(pattern[i]==='*'&&pattern[i+1]==='*'){while(pattern[i+1]==='*')i++;if(pattern[i+1]==='/'){tokens.push('DIR');i++;}else tokens.push('ANY');}else tokens.push(pattern[i]);}
 let next=new Uint8Array(text.length+1);next[text.length]=1;
 for(let i=tokens.length-1;i>=0;i--){const token=tokens[i],row=new Uint8Array(text.length+1);let directorySuffix=0;for(let j=text.length;j>=0;j--){if(token==='ANY')row[j]=next[j]||(j<text.length?row[j+1]:0);else if(token==='*')row[j]=next[j]||(j<text.length&&text[j]!=='/'?row[j+1]:0);else if(token==='DIR'){if(text[j]==='/'&&next[j+1])directorySuffix=1;row[j]=next[j]||directorySuffix;}else if(j<text.length&&(token==='?'?text[j]!=='/':token===text[j]))row[j]=next[j+1];}next=row;}
 return !!next[0];
}
export function scopeProjectFiles(files:Record<string,string>,scope:ProjectSearchScope):{files:Record<string,string>;error?:string}{try{const include=parse(scope.include),exclude=parse(scope.exclude);return {files:Object.fromEntries(Object.entries(files).filter(([path])=>(!include.length||include.some(p=>matchesPathGlob(path,p)))&&!exclude.some(p=>matchesPathGlob(path,p))))};}catch{return {files:{},error:'invalid-scope'};}}
