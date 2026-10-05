/** File management helpers for the Files panel. All changes go through editor operations, so they are undoable. */
import {EditorProject} from '@somnia/editor-core';
export const STARTER:Record<string,string>={html:'<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>New page</title>\n</head>\n<body>\n  \n</body>\n</html>\n',css:'/* Styles */\n',js:'// Script\n'};
export const starterFor=(path:string)=>STARTER[(/\.([a-z0-9]+)$/i.exec(path)?.[1]??'').toLowerCase().replace(/^htm$/,'html')]??'';
export function copyName(path:string,existing:string[]):string{const taken=new Set(existing.map(f=>f.toLowerCase()));const m=/^(.*?)(\.[^./]+)?$/.exec(path)!;const base=m[1],ext=m[2]??'';for(let i=1;i<1000;i++){const c=`${base}-copy${i>1?`-${i}`:''}${ext}`;if(!taken.has(c.toLowerCase()))return c;}return `${base}-copy-${Date.now()}${ext}`;}
export const checkPath=(path:string)=>EditorProject.validPath(path.trim());
/** Renaming a folder renames every file below it. */
export function folderRename(files:string[],from:string,to:string):{file:string;to:string}[]{return files.filter(f=>f.startsWith(from+'/')).map(f=>({file:f,to:to+f.slice(from.length)}));}
