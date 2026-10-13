/** Pure, bounded navigation. Numeric jumps are one-based and only commit on Enter. */
export interface PresentKeyState {index:number;count:number;digits:string;black:boolean}
export function presentationKey(key:string,state:PresentKeyState){
 const {index,count}=state;
 if(/^\d$/.test(key))return {...state,digits:(state.digits+key).slice(0,6)};
 if(key==='Enter'){const target=Number(state.digits)-1;return {...state,index:state.digits&&target>=0&&target<count?target:index,digits:''};}
 if(key==='Backspace')return {...state,digits:state.digits.slice(0,-1)};
 if(key.toLowerCase()==='b')return {...state,black:!state.black};
 const delta=['ArrowRight',' ','PageDown'].includes(key)?1:['ArrowLeft','PageUp'].includes(key)?-1:0;
 if(delta||key==='Home'||key==='End')return {...state,index:key==='Home'?0:key==='End'?Math.max(0,count-1):Math.max(0,Math.min(count-1,index+delta)),digits:'',black:false};
 return null;
}
export function presentationScale(widthPt:number,heightPt:number,width:number,height:number,dpr:number){return Math.min(Math.sqrt(7_990_000/(widthPt*heightPt)),3840/widthPt,2160/heightPt,Math.max(1,width*dpr)/widthPt,Math.max(1,height*dpr)/heightPt);}
