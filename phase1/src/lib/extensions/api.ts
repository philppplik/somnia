import type {ExtensionManifest,Permission} from './types';
/** Host-side API for extension workers. Every call is checked against the manifest permissions; results are plain JSON, never object references. */
export interface ApiDeps{files():Record<string,string>;selection():{id:string;tag:string}|null;notify(text:string):void;registerHandler(id:string):void;storage?:{get(key:string):string|null;set(key:string,value:string):void}}
const NEED:Record<string,Permission>={'commands.register':'commands','project.listFiles':'project.read','project.readFile':'project.read','selection.get':'selection','ui.notify':'ui.notify','storage.get':'storage','storage.set':'storage'};
export function callApi(manifest:ExtensionManifest,method:string,args:unknown[],deps:ApiDeps):unknown{
 const need=NEED[method];if(!need)throw Error(`Unknown API method: ${method}`);
 if(!manifest.permissions.includes(need))throw Error(`${method} needs the "${need}" permission, which ${manifest.name} did not declare.`);
 switch(method){
  case 'commands.register':{const id=args[0];if(typeof id!=='string'||!manifest.contributes.commands.some(c=>c.id===id))throw Error('Command ids must be declared in the manifest.');deps.registerHandler(id);return null;}
  case 'project.listFiles':return Object.keys(deps.files()).sort();
  case 'project.readFile':{const path=args[0];const files=deps.files();if(typeof path!=='string'||!Object.prototype.hasOwnProperty.call(files,path))throw Error('File not found in the open project.');return files[path];}
  case 'selection.get':return deps.selection();
  case 'storage.get':{const k=args[0];if(typeof k!=='string'||!k||k.length>100)throw Error('Storage keys are strings up to 100 characters.');return deps.storage?.get(k)??null;}
  case 'storage.set':{const [k,v]=args;if(typeof k!=='string'||!k||k.length>100||typeof v!=='string')throw Error('storage.set needs a key and a string value.');if(v.length>20000)throw Error('Storage values are limited to 20000 characters.');deps.storage?.set(k,v);return null;}
  case 'ui.notify':{const text=args[0];if(typeof text!=='string')throw Error('ui.notify needs a text.');deps.notify(text.slice(0,200));return null;}
 }
 return null;
}
