import type {ExtensionManifest,Permission} from './types';
/** Host-side API for extension workers. Every call is checked against the manifest permissions; results are plain JSON, never object references. */
export interface ApiDeps{files():Record<string,string>;selection():{id:string;tag:string}|null;notify(text:string):void;registerHandler(id:string):void}
const NEED:Record<string,Permission>={'commands.register':'commands','project.listFiles':'project.read','project.readFile':'project.read','selection.get':'selection','ui.notify':'ui.notify'};
export function callApi(manifest:ExtensionManifest,method:string,args:unknown[],deps:ApiDeps):unknown{
 const need=NEED[method];if(!need)throw Error(`Unknown API method: ${method}`);
 if(!manifest.permissions.includes(need))throw Error(`${method} needs the "${need}" permission, which ${manifest.name} did not declare.`);
 switch(method){
  case 'commands.register':{const id=args[0];if(typeof id!=='string'||!manifest.contributes.commands.some(c=>c.id===id))throw Error('Command ids must be declared in the manifest.');deps.registerHandler(id);return null;}
  case 'project.listFiles':return Object.keys(deps.files()).sort();
  case 'project.readFile':{const path=args[0];const files=deps.files();if(typeof path!=='string'||!Object.prototype.hasOwnProperty.call(files,path))throw Error('File not found in the open project.');return files[path];}
  case 'selection.get':return deps.selection();
  case 'ui.notify':{const text=args[0];if(typeof text!=='string')throw Error('ui.notify needs a text.');deps.notify(text.slice(0,200));return null;}
 }
 return null;
}
