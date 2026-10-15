import type {ProjectRow} from './projectIndex';
export function parentFolders(path:string):string[]{const parts=path.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/'));}
/** Filter by exact path segments, never by an ambiguous string prefix. */
export function visibleProjectRows(rows:readonly ProjectRow[],collapsed:ReadonlySet<string>):ProjectRow[]{return rows.filter(row=>!parentFolders(row.path).some(path=>collapsed.has(path)));}
export function revealProjectPath(collapsed:ReadonlySet<string>,path:string):Set<string>{const next=new Set(collapsed);for(const folder of parentFolders(path))next.delete(folder);return next;}
export function projectTreeDestination(rows:readonly ProjectRow[],path:string,key:string,collapsed:ReadonlySet<string>):{path:string;toggle?:string}|null{
 const i=rows.findIndex(row=>row.path===path);if(i<0)return null;const row=rows[i];
 if(key==='ArrowDown')return {path:rows[Math.min(rows.length-1,i+1)].path};
 if(key==='ArrowUp')return {path:rows[Math.max(0,i-1)].path};
 if(key==='Home')return {path:rows[0].path};if(key==='End')return {path:rows.at(-1)!.path};
 if(key==='ArrowRight'&&row.dir){if(collapsed.has(path))return {path,toggle:path};const child=rows.find(r=>r.depth===row.depth+1&&r.path.startsWith(path+'/'));return {path:child?.path??path};}
 if(key==='ArrowLeft'){if(row.dir&&!collapsed.has(path))return {path,toggle:path};const parent=parentFolders(path).at(-1);return {path:parent&&rows.some(r=>r.dir&&r.path===parent)?parent:path};}
 return null;
}
