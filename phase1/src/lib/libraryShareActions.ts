import {applyOperations,getState} from '../store/appStore';
import {downloadText} from './exportProject';
import {loadLibrary,mutate,newId} from './componentActions';
import * as ls from './libraryShare';
import type {Component} from './componentSystem';

/** Download the personal library (or the given list) as a JSON file. */
export function exportToFile(list:Component[]=loadLibrary()){if(!list.length)throw new Error('The library is empty. Save a component first.');downloadText(ls.exportLibrary(list),ls.exportFileName(),'application/json');}

/** Read a chosen file and validate it. Throws plain-language errors. */
export async function readImportFile(file:File):Promise<ls.ParsedImport>{if(file.size>ls.MAX_IMPORT_BYTES)throw new Error('The file is larger than 4 MB. It is not a component library.');return ls.parseImport(await file.text());}

/** Components from the project's somnia-components.json, or null when the project has none. */
export function readProject():ls.ParsedImport|null{return ls.readProjectLibrary(getState().files);}

/** Write the library into the open project as somnia-components.json (create or replace, one undoable edit). */
export function saveToProject(list:Component[]=loadLibrary()){
 const s=getState();if(!s.coreConnected)throw new Error('Open a project folder first. The library file is saved inside the project.');
 if(!list.length)throw new Error('The library is empty. Save a component first.');
 const text=ls.exportLibrary(list);
 applyOperations([s.files[ls.PROJECT_LIBRARY_PATH]!==undefined?{type:'replaceSource',file:ls.PROJECT_LIBRARY_PATH,text}:{type:'createFile',file:ls.PROJECT_LIBRARY_PATH,text}]);
}

/** Merge into the personal library. Throws (and changes nothing) when a limit would be broken. */
export function mergeIntoLibrary(incoming:Component[],decide:(item:ls.MergeItem)=>ls.Resolution){let report!:ls.MergeReport;const list=mutate(cur=>{const r=ls.applyMerge(cur,incoming,decide,newId);report=r.report;return r.list;});return {list,report};}
