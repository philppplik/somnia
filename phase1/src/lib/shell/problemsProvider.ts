/**
 * ProblemsProvider (concept 4.7, package M4). A studio contributes problems (Code: syntax/A11y lint; later Documents:
 * missing fonts, Slides: overflow, ...). Providers are pure collectors over an input snapshot; the Problems panel and
 * the status slot read the same list. Session runtime failures stay in `problemsStore`.
 */
export type ProblemSeverity='error'|'warning';
export interface ProviderProblem{studio:string;severity:ProblemSeverity;message:string;file?:string;line?:number;col?:number;source:string;key:string;messageKey?:string}
export interface ProblemsInput{files:Readonly<Record<string,string>>}
export interface ProblemsProvider{id:string;studio:string;collect(input:ProblemsInput):readonly ProviderProblem[]}
export function createProblemsRegistry(){
 const providers=new Map<string,ProblemsProvider>();
 return {
  register(p:ProblemsProvider){providers.set(p.id,p);return()=>{if(providers.get(p.id)===p)providers.delete(p.id);};},
  has:(studio:string)=>[...providers.values()].some(p=>p.studio===studio),
  list:()=>[...providers.values()],
  /** A provider that throws is skipped: one broken studio must not blank the panel. */
  collect(input:ProblemsInput,studio?:string):ProviderProblem[]{
   return [...providers.values()].filter(p=>!studio||p.studio===studio).flatMap(p=>{try{return [...p.collect(input)];}catch{return [];}});
  },
 };
}
export type ProblemsRegistry=ReturnType<typeof createProblemsRegistry>;
export const summarizeProblems=(list:readonly {severity:ProblemSeverity}[])=>{const errors=list.filter(p=>p.severity==='error').length;return {errors,warnings:list.length-errors,total:list.length};};
