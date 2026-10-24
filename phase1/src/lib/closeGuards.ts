/** Close guards run by the desktop shell before the window closes; a guard returning true blocks the close. Studios register here so lib-core never imports studio code. */
const guards:Array<()=>boolean>=[];
export function registerCloseGuard(g:()=>boolean):void{guards.push(g);}
export function runCloseGuards():boolean{return guards.some(g=>g());}
