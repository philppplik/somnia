import {projectProblems} from './diagnostics';
import {createProblemsRegistry} from './shell/problemsProvider';
/** App-wide registry of studio problem providers (concept 4.7, M4). Code lint/A11y/references is the first provider. */
export const problemsProviders=createProblemsRegistry();
problemsProviders.register({id:'code.syntax',studio:'code',collect:({files})=>projectProblems(files).map((p,i)=>({...p,studio:'code',key:`syntax:${p.file}:${p.line}:${p.col}:${i}`,source:'syntax'}))});
