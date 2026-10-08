/** Builds the live, sanitised DOM the editor draws and hit-tests. Source offsets live in source.ts; this is only for pixels. */
const UNSAFE=new Set(['script','foreignObject','iframe','object','embed','audio','video','canvas']);
export interface Display{svg:SVGSVGElement;w:number;h:number}
export function buildDisplay(text:string):Display|null{
 const doc=new DOMParser().parseFromString(text,'image/svg+xml');
 if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName!=='svg')return null;
 const svg=document.importNode(doc.documentElement,true) as unknown as SVGSVGElement;
 const annotate=(el:Element,path:number[])=>{el.setAttribute('data-sp',path.join('.'));let i=0;for(const c of Array.from(el.children))annotate(c,[...path,i++]);};
 annotate(svg,[]);
 const all=[svg,...Array.from(svg.querySelectorAll('*'))];
 for(const el of all){
  if(el!==svg&&UNSAFE.has(el.localName)){el.remove();continue;}
  for(const a of Array.from(el.attributes)){
   const n=a.name.toLowerCase();
   if(n.startsWith('on'))el.removeAttribute(a.name);
   else if((n==='href'||n==='xlink:href')&&!/^(#|data:image\/)/i.test(a.value.trim()))el.removeAttribute(a.name);
   else if(/javascript:/i.test(a.value))el.removeAttribute(a.name);
  }
  if(el.localName==='style')el.textContent=(el.textContent??'').replace(/@import[^;]*;?/gi,'').replace(/url\(\s*['"]?(?!#|data:)[^)]*\)/gi,'none');
 }
 const num=(v:string|null)=>{if(!v||/%/.test(v))return NaN;return parseFloat(v);};
 let w=NaN,h=NaN;const vb=svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
 if(vb&&vb.length===4&&vb[2]>0&&vb[3]>0){w=vb[2];h=vb[3];}
 else{w=num(svg.getAttribute('width'));h=num(svg.getAttribute('height'));
  if(!(w>0)||!(h>0)){w=300;h=150;}
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);}
 svg.removeAttribute('x');svg.removeAttribute('y');
 return{svg,w,h};}
