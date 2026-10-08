import type {GitBackend,GitChange,GitCommitRequest,GitError,GitRepoInfo,GitRepoState,GitStatus,GitVersion} from '../../lib/git/types';
export const fakeRepo=(o:Partial<GitRepoInfo>={}):GitRepoInfo=>({root:'/p',projectPrefix:'',branch:'main',detached:false,unborn:false,head:'a'.repeat(40),upstream:null,ahead:0,behind:0,hasLfs:false,hasSubmodules:false,gitVersion:'2.43.0',...o});
export const fakeChange=(path:string,o:Partial<GitChange>={}):GitChange=>({path,kind:'modified',staged:false,unstaged:true,binary:false,...o});
const err=(code:GitError['code'],message=code):GitError=>({code,message});
export interface FakeBackend extends GitBackend{calls:string[];commits:GitCommitRequest[];state:GitRepoState;changes:GitChange[];token:number;failNextCommit:GitError|null;failStatus:GitError|null;}
/** In-memory GitBackend for tests. Enforces the contract rules the UI relies on (stateToken, nothing-to-commit). */
export function createFakeBackend(init:{state?:GitRepoState;changes?:GitChange[]}={}):FakeBackend{
 const f:FakeBackend={calls:[],commits:[],state:init.state??{kind:'ready',repo:fakeRepo()},changes:init.changes??[],token:1,failNextCommit:null,failStatus:null,
  async detect(){f.calls.push('detect');return f.state;},
  async status():Promise<GitStatus>{f.calls.push('status');if(f.failStatus)throw f.failStatus;if(f.state.kind!=='ready')throw err('blocked');return{repo:f.state.repo,changes:f.changes,stateToken:`t${f.token}`,truncated:false};},
  async diff(path,base,target){f.calls.push(`diff:${path}`);return{path,binary:false,base,target,unified:'',tooLarge:false};},
  async trustRepo(){f.calls.push('trust');return f.state;},
  async init(){f.calls.push('init');f.state={kind:'ready',repo:fakeRepo({unborn:true,branch:'main',head:null})};return f.state;},
  async commit(req){f.calls.push('commit');if(f.failNextCommit){const e=f.failNextCommit;f.failNextCommit=null;throw e;}
   if(req.stateToken!==`t${f.token}`)throw err('state-changed');if(!req.paths.length)throw err('nothing-to-commit');
   f.commits.push(req);f.changes=f.changes.filter(c=>!req.paths.includes(c.path));f.token++;
   return{sha:'b'.repeat(40),subject:req.subject,body:req.body??'',authorName:'T',time:1,parents:[],changedFiles:req.paths.length} as GitVersion;},
  async log(){f.calls.push('log');return[];},
  async restoreAsNewVersion(){f.calls.push('restore');throw err('unknown');}};
 return f;}
