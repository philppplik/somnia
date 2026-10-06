/** Folder name Somnia creates for "new folder inside the chosen one": project name made safe for file systems. Shared by the save flow and the Save dialog hint so the hint is exact. */
export function folderNameFor(projectName:string,fallback='somnia-project'):string{
 return (projectName||fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,80)||fallback;
}
