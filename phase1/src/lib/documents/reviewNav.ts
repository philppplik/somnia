import type {ReviewChange} from './protocol';
/** The tracked change after (dir 1) or before (dir -1) a caret position, wrapping round; null when there are none. Order is by paragraph, then offset. */
export function adjacentChange(changes:readonly ReviewChange[],pos:{block:number;off:number}|null,dir:1|-1):ReviewChange|null{
 if(changes.length===0)return null;
 const sorted=[...changes].sort((a,b)=>a.block-b.block||a.start-b.start);
 if(!pos)return dir>0?sorted[0]:sorted[sorted.length-1];
 const after=(c:ReviewChange)=>c.block>pos.block||(c.block===pos.block&&c.start>pos.off);
 const before=(c:ReviewChange)=>c.block<pos.block||(c.block===pos.block&&c.start<pos.off);
 if(dir>0)return sorted.find(after)??sorted[0];
 for(let i=sorted.length-1;i>=0;i--)if(before(sorted[i]))return sorted[i];
 return sorted[sorted.length-1];
}
