/** Pure, bounded navigation. Numeric jumps are one-based and only commit on Enter. */
export interface PresentKeyState {index:number;count:number;digits:string;black:boolean;hidden?:readonly boolean[];sections?:readonly number[]}
/** Next slide index in a direction that is not hidden; stays put when none is left. Explicit number jumps may still land on a hidden slide. */
export function stepVisible(hidden:readonly boolean[]|undefined,index:number,delta:1|-1,count:number){for(let i=index+delta;i>=0&&i<count;i+=delta)if(!hidden?.[i])return i;return index;}
/** Start index of every section in slide order (first slide id of each section). Unknown ids are skipped; the result is sorted and unique. */
export function sectionStartIndexes(sections:readonly {ids:readonly number[]}[]|null|undefined,slideIds:readonly number[]):number[]{
 const at=new Map(slideIds.map((id,i)=>[id,i] as const)),out=new Set<number>();
 for(const sec of sections??[]){const idx=sec.ids.map(id=>at.get(id)).filter((i):i is number=>i!==undefined);if(idx.length)out.add(Math.min(...idx));}
 return [...out].sort((a,b)=>a-b).slice(0,1000);
}
/** Target of a section jump: the first visible slide of the next section, or of the current section when jumping back from inside it. Stays put when there is none. */
export function sectionJump(starts:readonly number[]|undefined,hidden:readonly boolean[]|undefined,index:number,count:number,dir:1|-1):number{
 if(!starts?.length)return index;
 const firstVisible=(from:number,to:number)=>{for(let i=from;i<to&&i<count;i++)if(!hidden?.[i])return i;return -1;};
 const bounds=[...starts,count];
 if(dir===1){for(let k=0;k<starts.length;k++){if(starts[k]<=index)continue;const t=firstVisible(starts[k],bounds[k+1]);if(t>=0)return t;}return index;}
 for(let k=starts.length-1;k>=0;k--){if(starts[k]>=index)continue;const t=firstVisible(starts[k],bounds[k+1]);if(t>=0&&t<index)return t;}
 return index;
}
export function presentationKey(key:string,state:PresentKeyState){
 const {index,count}=state;
 if(/^\d$/.test(key))return {...state,digits:(state.digits+key).slice(0,6)};
 if(key==='Enter'){const target=Number(state.digits)-1;return {...state,index:state.digits&&target>=0&&target<count?target:index,digits:''};}
 if(key==='Backspace')return {...state,digits:state.digits.slice(0,-1)};
 if(key===']'||key==='[')return {...state,index:sectionJump(state.sections,state.hidden,index,count,key===']'?1:-1),digits:'',black:false};
 if(key.toLowerCase()==='b')return {...state,black:!state.black};
 const delta=['ArrowRight',' ','PageDown'].includes(key)?1:['ArrowLeft','PageUp'].includes(key)?-1:0;
 if(delta||key==='Home'||key==='End'){const first=stepVisible(state.hidden,-1,1,count),last=stepVisible(state.hidden,count,-1,count);return {...state,index:key==='Home'?(first<0||first>=count?0:first):key==='End'?(last<0||last>=count?Math.max(0,count-1):last):stepVisible(state.hidden,index,delta as 1|-1,count),digits:'',black:false};}
 return null;
}
export function presentationScale(widthPt:number,heightPt:number,width:number,height:number,dpr:number){return Math.min(Math.sqrt(7_990_000/(widthPt*heightPt)),3840/widthPt,2160/heightPt,Math.max(1,width*dpr)/widthPt,Math.max(1,height*dpr)/heightPt);}
