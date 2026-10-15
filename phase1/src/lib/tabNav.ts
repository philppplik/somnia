/** APG tabs keyboard navigation: target index for ArrowLeft/Right (wrapping), Home and End. */
export function nextTabIndex(key:string,current:number,count:number):number|null{
 if(count<=0||current<0||current>=count)return null;
 if(key==='Home')return 0;
 if(key==='End')return count-1;
 if(key==='ArrowLeft')return (current-1+count)%count;
 if(key==='ArrowRight')return (current+1)%count;
 return null;
}
