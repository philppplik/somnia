import type {DocumentsEngine} from './engine';
import {pngScale} from './saveCopy';
/** Most pages one print job renders (each page is a bitmap held in memory until printing ends). */
export const MAX_PRINT_PAGES=100;
/** The page a print job for `pages` pages is refused with, or null when it is fine. */
export function printProblem(pages:number):string|null{
 if(!Number.isInteger(pages)||pages<1)return 'There is nothing to print.';
 if(pages>MAX_PRINT_PAGES)return `Printing is limited to ${MAX_PRINT_PAGES} pages at a time. Export a PDF instead.`;
 return null;
}
/** The HTML for the hidden print frame: one full-width image per page, each on its own sheet, no margins of our own. Only blob: image addresses are accepted. */
export function buildPrintHtml(urls:readonly string[]):string{
 if(urls.length===0||urls.length>MAX_PRINT_PAGES)throw new Error('Wrong number of pages to print.');
 for(const u of urls)if(!/^blob:[A-Za-z0-9:/._-]+$/.test(u))throw new Error('Only rendered pages can be printed.');
 const imgs=urls.map(u=>`<img src="${u}" alt="">`).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><title></title><style>@page{margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;height:auto;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}</style></head><body>${imgs}</body></html>`;
}
/**
 * Prints the document through the system print dialog: renders each page as an image, puts them in a hidden frame and prints that.
 * The opened document is untouched. Returns once the print dialog has been handed the pages.
 */
export async function printDocument(engine:DocumentsEngine,sizes:readonly {width:number;height:number}[]):Promise<void>{
 const problem=printProblem(sizes.length);if(problem)throw new Error(problem);
 const urls:string[]=[];
 const cleanup=(frame:HTMLIFrameElement|null)=>{frame?.remove();for(const u of urls)URL.revokeObjectURL(u);};
 let frame:HTMLIFrameElement|null=null;
 try{
  for(let i=0;i<sizes.length;i++){
   const scale=pngScale(sizes[i]!.width,sizes[i]!.height);if(scale===null)throw new Error('A page has no size.');
   urls.push(URL.createObjectURL(await engine.render(i,Math.min(scale,1.5))));
  }
  frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
  frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const loaded=new Promise<void>(res=>{frame!.onload=()=>res();});
  frame.srcdoc=buildPrintHtml(urls);document.body.appendChild(frame);await loaded;
  const win=frame.contentWindow;if(!win)throw new Error('The print frame could not be opened.');
  await Promise.all(Array.from(win.document.images).map(im=>im.complete?Promise.resolve():new Promise<void>(res=>{im.onload=()=>res();im.onerror=()=>res();})));
  const f=frame;win.addEventListener('afterprint',()=>cleanup(f),{once:true});
  setTimeout(()=>cleanup(f),10*60*1000);
  win.focus();win.print();
 }catch(e){cleanup(frame);throw e;}
}
