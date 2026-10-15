/** APG tabs keyboard navigation: target index for ArrowLeft/Right (wrapping), Home and End. */
export function nextTabIndex(key:string,current:number,count:number):number|null{
 if(count<=0||current<0||current>=count)return null;
 if(key==='Home')return 0;
 if(key==='End')return count-1;
 if(key==='ArrowLeft')return (current-1+count)%count;
 if(key==='ArrowRight')return (current+1)%count;
 return null;
}

/** APG vertical-menu keyboard navigation: target index for ArrowUp/Down (wrapping), Home and End. */
export function nextMenuItemIndex(key:string,current:number,count:number):number|null{
 if(count<=0||current<0||current>=count)return null;
 if(key==='Home')return 0;
 if(key==='End')return count-1;
 if(key==='ArrowUp')return (current-1+count)%count;
 if(key==='ArrowDown')return (current+1)%count;
 return null;
}

/** Focuses (and activates) the APG tab target of an arrow/home/end key inside a tablist container. */
export function tabListKeyDown(e:{key:string;currentTarget:HTMLElement;preventDefault():void}):void{
 const tabs=[...e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')];
 const n=nextTabIndex(e.key,tabs.indexOf(document.activeElement as HTMLElement),tabs.length);
 if(n===null)return;
 e.preventDefault();
 tabs[n]?.focus();
 tabs[n]?.click();
}
