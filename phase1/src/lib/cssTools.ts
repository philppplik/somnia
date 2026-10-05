/** CSS tooling: list and edit custom properties, list and rename classes. Pure functions over the in-memory file map, no I/O. */
export interface CssVariable{file:string;name:string;value:string;scope:string;line:number;start:number;end:number;uses:number}
export interface CssClass{name:string;defined:number;used:number;files:string[]}
export const isCss=(f:string)=>/\.css$/i.test(f);
export const isHtml=(f:string)=>/\.html?$/i.test(f);
interface Region{file:string;offset:number;text:string}
/** Replaces comments with spaces so every offset stays valid. */
export function blankComments(t:string):string{return t.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '));}
/** CSS source regions per file: whole file for .css, each <style> body for .html. */
export function cssRegions(files:Readonly<Record<string,string>>):Region[]{
 const out:Region[]=[];
 for(const file of Object.keys(files).sort()){const t=files[file];
  if(isCss(file))out.push({file,offset:0,text:blankComments(t)});
  else if(isHtml(file)){const re=/<style\b[^>]*>([\s\S]*?)<\/style>/gi;let m:RegExpExecArray|null;while((m=re.exec(t))){const offset=m.index+m[0].indexOf('>')+1;out.push({file,offset,text:blankComments(m[1])});}}
 }return out;}
const lineAt=(text:string,i:number)=>text.slice(0,i).split('\n').length;
export function parseVariables(files:Readonly<Record<string,string>>):CssVariable[]{
 const vars:CssVariable[]=[];
 for(const r of cssRegions(files)){const block=/([^{}]+)\{([^{}]*)\}/g;let b:RegExpExecArray|null;
  while((b=block.exec(r.text))){const bodyStart=b.index+b[0].indexOf('{')+1;const scope=b[1].trim().replace(/\s+/g,' ').split(';').pop()!.trim();
   const decl=/(--[\w-]+)\s*:\s*([^;]*?)\s*(?=;|$)/g;let d:RegExpExecArray|null;
   while((d=decl.exec(b[2]))){const vi=b[2].indexOf(d[2],d.index+d[1].length);const start=r.offset+bodyStart+vi;
    vars.push({file:r.file,name:d[1],value:d[2],scope,line:lineAt(files[r.file],start),start,end:start+d[2].length,uses:0});}
  }}
 const counts=countVarUses(files);for(const v of vars)v.uses=counts.get(v.name)??0;return vars;}
export function countVarUses(files:Readonly<Record<string,string>>):Map<string,number>{
 const m=new Map<string,number>();for(const t of Object.values(files)){const re=/var\(\s*(--[\w-]+)/g;let x:RegExpExecArray|null;while((x=re.exec(t)))m.set(x[1],(m.get(x[1])??0)+1);}return m;}
/** Sets one declaration's value. `v` must come from parseVariables on the same files. Returns null for an invalid value. */
export function setVariableValue(files:Readonly<Record<string,string>>,v:Pick<CssVariable,'file'|'start'|'end'>,value:string):string|null{
 const clean=value.trim();if(!clean||/[;{}]/.test(clean)||/\/\*|\*\//.test(clean))return null;const t=files[v.file];if(t===undefined)return null;return t.slice(0,v.start)+clean+t.slice(v.end);}
/** Adds `--name: value;` to the first :root block of a CSS file, or creates one. */
export function addVariable(files:Readonly<Record<string,string>>,file:string,name:string,value:string):string|null{
 if(!/^--[\w-]+$/.test(name)||!value.trim()||/[;{}]/.test(value)||!(file in files))return null;const t=files[file];
 const m=/:root\s*\{/.exec(blankComments(t));const decl=`  ${name}: ${value.trim()};\n`;
 if(m){const at=m.index+m[0].length;return t.slice(0,at)+'\n'+decl.trimEnd()+t.slice(at);}
 return `:root {\n${decl}}\n\n${t}`;}
const CLASS_IDENT='-?[_a-zA-Z][\\w-]*';
export function classesInSelectors(css:string):string[]{
 const out:string[]=[];const sel=/([^{}]+)\{/g;let m:RegExpExecArray|null;
 while((m=sel.exec(css))){const s=m[1];if(/^\s*@(keyframes|font-face|charset|import)/.test(s))continue;const re=new RegExp(`\\.(${CLASS_IDENT})`,'g');let c:RegExpExecArray|null;
  while((c=re.exec(s.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'|\(\s*[\d.]+[^)]*\)/g,' ')))){out.push(c[1]);}}
 return out;}
export function classesInHtml(html:string):string[]{
 const out:string[]=[];const re=/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;let m:RegExpExecArray|null;
 while((m=re.exec(html)))for(const c of (m[1]??m[2]).split(/\s+/))if(c)out.push(c);return out;}
export function listClasses(files:Readonly<Record<string,string>>):CssClass[]{
 const map=new Map<string,CssClass>();const get=(n:string)=>{let c=map.get(n);if(!c){c={name:n,defined:0,used:0,files:[]};map.set(n,c);}return c;};
 const touch=(c:CssClass,f:string)=>{if(!c.files.includes(f))c.files.push(f);};
 for(const r of cssRegions(files))for(const n of classesInSelectors(r.text)){const c=get(n);c.defined++;touch(c,r.file);}
 for(const f of Object.keys(files).sort())if(isHtml(f))for(const n of classesInHtml(files[f].replace(/<style\b[\s\S]*?<\/style>/gi,m=>' '.repeat(m.length)))){const c=get(n);c.used++;touch(c,f);}
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));}
export const validClassName=(n:string)=>new RegExp(`^${CLASS_IDENT}$`).test(n);
/** Renames a class in CSS selectors and HTML class attributes. Returns only the changed files, or an error. */
export function renameClass(files:Readonly<Record<string,string>>,from:string,to:string):{changed:Record<string,string>;count:number}|{error:string}{
 if(!validClassName(to))return{error:'Class names may use letters, digits, hyphen and underscore, and cannot start with a digit.'};
 if(from===to)return{changed:{},count:0};
 if(listClasses(files).some(c=>c.name===to))return{error:`A class named "${to}" already exists. Merging classes is not supported.`};
 const esc=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const changed:Record<string,string>={};let count=0;
 const selRe=new RegExp(`(\\.)${esc}(?![\\w-])`,'g');
 const editCss=(css:string)=>{const blank=blankComments(css);let out='';let last=0;const sel=/([^{}]+)\{/g;let m:RegExpExecArray|null;
  while((m=sel.exec(blank))){if(/^\s*@(keyframes|font-face|charset|import)/.test(m[1]))continue;const seg=css.slice(m.index,m.index+m[1].length);const seg2=seg.replace(selRe,(_,d)=>{count++;return d+to;});out+=css.slice(last,m.index)+seg2;last=m.index+m[1].length;}
  return out+css.slice(last);};
 const clsRe=/(\sclass\s*=\s*)("([^"]*)"|'([^']*)')/gi;
 for(const [f,t] of Object.entries(files)){let n=t;
  if(isCss(f))n=editCss(t);
  else if(isHtml(f)){
   n=n.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,(_,a,b,c)=>a+editCss(b)+c);
   n=n.replace(clsRe,(all,pre,q,dq,sq)=>{const body=dq??sq;const parts=body.split(/(\s+)/);let hit=false;const np=parts.map((p:string)=>{if(p===from){hit=true;count++;return to;}return p;});return hit?pre+q[0]+np.join('')+q[0]:all;});}
  if(n!==t)changed[f]=n;}
 return{changed,count};}
