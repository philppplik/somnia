import * as Y from 'yjs';
import type {CollabDoc} from './collabDoc';
import {isCollabFile,isSafeProjectPath} from './paths';
import {applyTextToYText} from './textSync';
/** What the bridge needs from the app. The app wiring lives in appProject.ts; tests pass their own. */
export interface ProjectPort{
 files():Readonly<Record<string,string>>;
 /** Write one file into the open project (create it when missing). */
 write(path:string,text:string):void;
 /** Called after every change of the project's files; returns the unsubscribe. */
 subscribe(fn:()=>void):()=>void;
 /** Guest only: the first time the shared project has files, replace the local project with them. */
 adopt?(files:Record<string,string>):void;
}
export interface Bridge{stop():void}
/**
 * Keeps the app's project and the shared Y.Map<path, Y.Text> equal, in both directions, for text files only.
 * - project -> shared: only files whose text changed since the bridge last looked are pushed, as one minimal edit
 *   (so a stale project copy can never overwrite a newer remote edit).
 * - shared -> project: remote text changes are written into the project; Y events caused by this bridge are skipped.
 * File creation syncs. Rename and delete do not (they would need tombstones); the UI says so.
 */
export function startBridge(c:CollabDoc,port:ProjectPort,opts:{role:'host'|'guest';onFiles?:()=>void}):Bridge{
 let applying=false,adopted=opts.role==='host';
 const seen:Record<string,string>={};
 const remember=()=>{for(const [k,v] of Object.entries(port.files()))if(isCollabFile(k))seen[k]=v;};
 const pushLocal=()=>{
  if(applying||!adopted)return;
  const now=port.files();
  for(const [path,text] of Object.entries(now)){
   if(!isCollabFile(path)||seen[path]===text)continue;
   seen[path]=text;
   const yt=c.files.get(path);
   if(!yt)c.text(path,text);else applyTextToYText(yt,text,'project');}};
 const pullRemote=()=>{
  const snap=c.snapshot();
  if(!adopted){
   if(Object.keys(snap).length===0||!port.adopt)return;
   adopted=true;applying=true;try{port.adopt(snap);for(const [k,v] of Object.entries(snap))seen[k]=v;}finally{applying=false;}
   opts.onFiles?.();return;}
  const local=port.files();applying=true;
  try{for(const [path,text] of Object.entries(snap)){if(local[path]===text){seen[path]=text;continue;}port.write(path,text);seen[path]=text;}}
  finally{applying=false;}};
 const onDeep=(events:Y.YEvent<Y.AbstractType<unknown>>[],tx:Y.Transaction)=>{
  if(tx.local)return; // own edits (editor typing, project pushes, seeding) are already in the project
  pullRemote();
  // a file key appeared: editors may need to bind to it
  if(events.some(e=>e.target===c.files))opts.onFiles?.();};
 remember();
 c.files.observeDeep(onDeep);
 const off=port.subscribe(pushLocal);
 // guest that connected after the host already synced
 if(!adopted)pullRemote();
 return{stop(){c.files.unobserveDeep(onDeep);off();}};
}
export {isSafeProjectPath};
