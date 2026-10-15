/** APG modal-dialog focus trap: Tab / Shift+Tab cycles through the focusable controls inside the dialog. */
export const trapTabIndex=(shiftKey:boolean,current:number,length:number):number|null=>{
 if(length===0)return null;
 if(shiftKey&&current<=0)return length-1;
 if(!shiftKey&&(current<0||current===length-1))return 0;
 return null;
};
const FOCUSABLE='button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[role="button"]:not([aria-disabled="true"]),[tabindex="0"]';
/** Keydown handler for a hand-rolled dialog root: wraps focus at both ends of the tab order. */
export function dialogTrapKeyDown(e:{key:string;shiftKey:boolean;currentTarget:HTMLElement;preventDefault():void}):void{
 if(e.key!=='Tab')return;
 const els=[...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
 const n=trapTabIndex(e.shiftKey,els.indexOf(document.activeElement as HTMLElement),els.length);
 if(n===null)return;
 e.preventDefault();
 els[n]?.focus();
}
