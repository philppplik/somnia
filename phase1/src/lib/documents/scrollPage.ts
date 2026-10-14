/** Brings a page (0-based) into view in the Documents canvas. False when the page is not mounted (no document open). */
export function scrollToPage(index:number):boolean{
 if(typeof document==='undefined')return false;
 const el=document.querySelector<HTMLElement>(`[data-testid="documents-page"][data-page="${index+1}"]`);
 if(!el)return false;el.scrollIntoView({block:'start',behavior:'smooth'});return true;
}
