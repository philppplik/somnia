import * as Y from 'yjs';
import {Awareness} from 'y-protocols/awareness';
import {assertSafeProjectPath,isSafeProjectPath} from './paths';
import {applyTextToYText} from './textSync';
/** One shared project: Y.Map<path, Y.Text>, same layout as the ADR-005 spike (prototypes/collab-spike), so the relay can be reused. */
export class CollabDoc{
 readonly doc:Y.Doc;readonly awareness:Awareness;readonly files:Y.Map<Y.Text>;
 constructor(doc:Y.Doc=new Y.Doc()){this.doc=doc;this.awareness=new Awareness(doc);this.files=doc.getMap('files');}
 /** Get the shared text of a file. A new entry is seeded from local disk content (host side). */
 text(path:string,seed=''):Y.Text{
  assertSafeProjectPath(path);let t=this.files.get(path);
  if(!t){t=new Y.Text();this.doc.transact(()=>{this.files.set(path,t!);if(seed)t!.insert(0,seed);},'seed');}
  return t;
 }
 /** Whole-file write from the design view or any non-CodeMirror source. */
 setText(path:string,next:string):boolean{return applyTextToYText(this.text(path,next),next);}
 /** Current content of safe paths only. The host writes this to disk and never trusts other keys. */
 snapshot():Record<string,string>{const out:Record<string,string>={};this.files.forEach((t,k)=>{if(isSafeProjectPath(k))out[k]=t.toString();});return out;}
 destroy(){this.awareness.destroy();this.doc.destroy();}
}
