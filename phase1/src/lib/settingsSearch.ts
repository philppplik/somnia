/** Case/accent insensitive token search, with one-edit typo tolerance for longer words. */
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function settingsMatch(text:string,query:string):boolean{
 const hay=normalize(text),words=hay.split(/[^a-z0-9]+/);
 return normalize(query).trim().split(/\s+/).every(q=>hay.includes(q)||(q.length>=4&&words.some(w=>oneEdit(w,q))));
}
function oneEdit(a:string,b:string){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(i<a.length||j<b.length?1:0)<=1;}
