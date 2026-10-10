import type {GitBackend,GitError,GitErrorCode} from '../../lib/git/types';
let current:GitBackend|null=null;
/** The app (or tests) registers the backend. Nothing is registered until package A's commands exist. */
export const setGitBackend=(b:GitBackend|null)=>{current=b;};
export const getGitBackend=()=>current;
import type {GitRefsBackend} from '../../lib/git/refs/contract';
let currentRefs:GitRefsBackend|null=null;
/** Registered ref-level backend (tests, web preview fakes). The desktop app falls back to the Tauri adapter. */
export const setGitRefsBackend=(b:GitRefsBackend|null)=>{currentRefs=b;};
export const getGitRefsBackend=()=>currentRefs;
/** Tauri implementation of the contract. Command names and arg shapes come from docs/git/CONTRACT.md. */
export function createTauriGitBackend(invoke:<T>(cmd:string,args?:Record<string,unknown>)=>Promise<T>):GitBackend{
 return{detect:()=>invoke('git_detect'),status:()=>invoke('git_status'),
  diff:(path,base,target)=>invoke('git_diff_file',{path,base,target}),init:()=>invoke('git_init'),trustRepo:()=>invoke('git_trust_repo'),
  commit:req=>invoke('git_commit',{request:req}),log:req=>invoke('git_log',{request:req}),
  restoreAsNewVersion:req=>invoke('git_restore_as_new_version',{request:req})};}
/** Commands reject with a JSON string; anything else becomes `unknown` with no detail. */
export function parseGitError(e:unknown):GitError{
 const raw=typeof e==='string'?e:e instanceof Error?e.message:'';
 try{const o=JSON.parse(raw) as Partial<GitError>;if(o&&typeof o.code==='string')return{code:o.code as GitErrorCode,message:String(o.message??''),detail:o.detail};}catch{/* not JSON */}
 if(e&&typeof e==='object'&&'code' in e&&typeof (e as GitError).code==='string')return e as GitError;
 return{code:'unknown',message:''};}
