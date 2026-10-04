import type {DiffLine} from './sourceDiff';
/** Indexes of the first line of each changed block, for next/previous change navigation. */
export function changeStarts(lines:DiffLine[]):number[]{const out:number[]=[];lines.forEach((l,i)=>{if(l.kind!=='same'&&(i===0||lines[i-1].kind==='same'))out.push(i);});return out;}
export interface SideRow{left?:DiffLine;right?:DiffLine;index:number}
/** Pairs removed and added lines of a changed block side by side. `index` is the position of the block's first line in the inline list. */
export function sideBySide(lines:DiffLine[]):SideRow[]{const rows:SideRow[]=[];let i=0;while(i<lines.length){if(lines[i].kind==='same'){rows.push({left:lines[i],right:lines[i],index:i});i++;continue;}const start=i;const rem:DiffLine[]=[],add:DiffLine[]=[];while(i<lines.length&&lines[i].kind!=='same'){(lines[i].kind==='removed'?rem:add).push(lines[i]);i++;}for(let k=0;k<Math.max(rem.length,add.length);k++)rows.push({left:rem[k],right:add[k],index:k===0?start:-1});}return rows;}
export const diffStats=(lines:DiffLine[])=>({added:lines.filter(l=>l.kind==='added').length,removed:lines.filter(l=>l.kind==='removed').length});
