import type {ExtensionManifest,Permission} from './types';
/** Host-side API for extension workers. Every call is checked against the manifest permissions; results are plain JSON, never object references. */
export interface ApiDeps{files():Record<string,string>;selection():{id:string;tag:string}|null;notify(text:string):void;registerHandler(id:string):void;applyOperations?(ops:Record<string,unknown>[]):void;storage?:{get(key:string):string|null;set(key:string,value:string):void}}
const NEED:Record<string,Permission>={'commands.register':'commands','project.listFiles':'project.read','project.readFile':'project.read','selection.get':'selection','editor.applyOperations':'project.write','ui.notify':'ui.notify','storage.get':'storage','storage.set':'storage'};
/** replaceSource is deliberately not allowed: extensions edit through structured operations that stay undoable and never write to disk. */
export const WRITE_OPS=['formatText','setText','setAttribute','setStyle','insertHTML','remove','move'];
export function callApi(manifest:ExtensionManifest,method:string,args:unknown[],deps:ApiDeps):unknown{
 if(!Object.hasOwn(NEED,method))throw Error(`Unknown API method: ${method}`);const need=NEED[method];
 if(!manifest.permissions.includes(need))throw Error(`${method} needs the "${need}" permission, which ${manifest.name} did not declare.`);
 switch(method){
  case 'commands.register':{const id=args[0];if(typeof id!=='string'||!manifest.contributes.commands.some(c=>c.id===id))throw Error('Command ids must be declared in the manifest.');deps.registerHandler(id);return null;}
  case 'project.listFiles':return Object.keys(deps.files()).sort();
  case 'project.readFile':{const path=args[0];const files=deps.files();if(typeof path!=='string'||!Object.prototype.hasOwnProperty.call(files,path))throw Error('File not found in the open project.');return files[path];}
  case 'editor.applyOperations':{
   const ops=args[0];if(!Array.isArray(ops)||!ops.length||ops.length>50)throw Error('editor.applyOperations needs 1 to 50 operations.');
   const files=deps.files();const clean:Record<string,unknown>[]=[];
   for(const op of ops){if(typeof op!=='object'||op===null||Array.isArray(op))throw Error('Each operation must be an object.');const o=op as Record<string,unknown>;
    if(typeof o.type!=='string'||!WRITE_OPS.includes(o.type))throw Error(`Operation type ${String(o.type)} is not allowed. Allowed: ${WRITE_OPS.join(', ')}.`);
    if(typeof o.file!=='string'||!Object.prototype.hasOwnProperty.call(files,o.file))throw Error('Operation file must be a file of the open project.');
    if(JSON.stringify(o).length>100000)throw Error('Operation is too large.');clean.push(o);}
   if(!deps.applyOperations)throw Error('Editing is not available right now.');deps.applyOperations(clean);return clean.length;}
  case 'selection.get':return deps.selection();
  case 'storage.get':{const k=args[0];if(typeof k!=='string'||!k||k.length>100)throw Error('Storage keys are strings up to 100 characters.');return deps.storage?.get(k)??null;}
  case 'storage.set':{const [k,v]=args;if(typeof k!=='string'||!k||k.length>100||typeof v!=='string')throw Error('storage.set needs a key and a string value.');if(v.length>20000)throw Error('Storage values are limited to 20000 characters.');deps.storage?.set(k,v);return null;}
  case 'ui.notify':{const text=args[0];if(typeof text!=='string')throw Error('ui.notify needs a text.');deps.notify(text.slice(0,200));return null;}
 }
 return null;
}
