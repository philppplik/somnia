/**
 * Variant editing, pure logic (no DOM, no storage). Builds on componentSystem.ts.
 * Adds duplicate, safe in-place save with ID checks, and a line diff between two variants.
 */
import {LIMITS,idsIn,stripMarks,updateVariant,type Component,type Variant} from './componentSystem';

const find=(list:Component[],id:string)=>{const c=list.find(x=>x.id===id);if(!c)throw new Error('This component no longer exists.');return c;};
const norm=(s:string)=>s.trim().toLowerCase();

/** Next free "<name> copy", "<name> copy 2", ... that fits the name limit and does not clash (case-insensitive). */
export function copyName(existing:string[],base:string):string{
 const used=new Set(existing.map(norm));
 for(let i=1;i<1000;i++){
  const suffix=i===1?' copy':` copy ${i}`;
  const name=base.trim().slice(0,Math.max(1,LIMITS.name-suffix.length))+suffix;
  if(!used.has(norm(name)))return name;
 }
 throw new Error('Could not find a free name for the copy. Rename some variants first.');
}

/** Copies a variant (same HTML, new id, name "<name> copy"). The copy is placed right after the original. */
export function duplicateVariant(list:Component[],componentId:string,variantId:string,newId:()=>string):Component[]{
 const c=find(list,componentId);
 const v=c.variants.find(x=>x.id===variantId);
 if(!v)throw new Error('This variant no longer exists.');
 if(c.variants.length>=LIMITS.variants)throw new Error(`A component can have at most ${LIMITS.variants} variants.`);
 const copy:Variant={id:newId(),name:copyName(c.variants.map(x=>x.name),v.name),html:v.html};
 const at=c.variants.indexOf(v)+1;
 const variants=[...c.variants.slice(0,at),copy,...c.variants.slice(at)];
 return list.map(x=>x.id===c.id?{...x,variants}:x);
}

/** Plain-language problem with the edited HTML, or null if it can be saved. Variants of one component may share IDs (only one is placed at a time), but a variant may not repeat an ID inside itself. */
export function variantHtmlProblem(html:string):string|null{
 if(!html.trim())return 'The variant is empty. Write some HTML or cancel.';
 if(html.length>LIMITS.html)return 'This block exceeds the 100 KB library limit.';
 const ids=idsIn(html);
 if(new Set(ids).size!==ids.length)return 'This variant repeats an ID inside itself. Fix the ID first.';
 if(!/^\s*<[a-zA-Z]/.test(html))return 'A variant must start with an HTML tag, for example <button ...>.';
 return null;
}

/** True when saving would change nothing (marks are ignored, as they are stripped on save). */
export function isUnchanged(list:Component[],componentId:string,variantId:string,html:string):boolean{
 const v=find(list,componentId).variants.find(x=>x.id===variantId);
 return !!v&&v.html===stripMarks(html);
}

/** Saves edited HTML into one variant. Refuses bad input with a plain-language error and returns a new list; the input list is never changed. */
export function saveVariantHtml(list:Component[],componentId:string,variantId:string,html:string):Component[]{
 const problem=variantHtmlProblem(html);
 if(problem)throw new Error(problem);
 return updateVariant(list,componentId,variantId,html);
}

export type DiffKind='same'|'added'|'removed';
export interface DiffLine{kind:DiffKind;text:string}

/** Splits HTML into comparable lines. Tags that sit on one line stay together; a single long line is split before each "<". */
export function htmlLines(html:string):string[]{
 const raw=stripMarks(html).replace(/\r\n?/g,'\n').split('\n').map(l=>l.trimEnd()).filter(l=>l.trim()!=='');
 if(raw.length===1&&raw[0].length>80)return raw[0].split(/(?=<)/).map(l=>l.trim()).filter(Boolean);
 return raw;
}

/** Line diff (longest common subsequence) between variant A and variant B. Inputs are capped so it stays fast. */
export function diffVariants(a:string,b:string,maxLines=600):DiffLine[]{
 const x=htmlLines(a),y=htmlLines(b);
 if(x.length>maxLines||y.length>maxLines)throw new Error(`The diff is limited to ${maxLines} lines per variant.`);
 const n=x.length,m=y.length;
 const t:number[][]=Array.from({length:n+1},()=>new Array<number>(m+1).fill(0));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)t[i][j]=x[i]===y[j]?t[i+1][j+1]+1:Math.max(t[i+1][j],t[i][j+1]);
 const out:DiffLine[]=[];let i=0,j=0;
 while(i<n&&j<m){
  if(x[i]===y[j]){out.push({kind:'same',text:x[i]});i++;j++;}
  else if(t[i+1][j]>=t[i][j+1]){out.push({kind:'removed',text:x[i]});i++;}
  else{out.push({kind:'added',text:y[j]});j++;}
 }
 while(i<n)out.push({kind:'removed',text:x[i++]});
 while(j<m)out.push({kind:'added',text:y[j++]});
 return out;
}

export function diffSummary(d:DiffLine[]):string{
 const add=d.filter(l=>l.kind==='added').length,rem=d.filter(l=>l.kind==='removed').length;
 if(!add&&!rem)return 'No differences.';
 const p=(n:number,w:string)=>`${n} ${w}${n===1?'':'s'}`;
 return `${p(add,'line')} added, ${p(rem,'line')} removed.`;
}
