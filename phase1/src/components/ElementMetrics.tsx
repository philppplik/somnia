import {useEffect,useState} from 'react';
import type {EditorNode} from '../lib/editorPort';
/** Read-only element facts for the Inspector: size, box model and attributes. Measured from the preview iframe (same-origin srcdoc). */
export interface Metrics{width:number;height:number;margin:number[];border:number[];padding:number[]}
const px=(v:string)=>Math.round((parseFloat(v)||0)*10)/10;
export function measureNode(doc:Document|null|undefined,nodeId:string):Metrics|null{
 const el=doc?.querySelector(`[data-editor-node="${nodeId}"]`) as HTMLElement|null;const win=doc?.defaultView;if(!el||!win)return null;
 const cs=win.getComputedStyle(el),r=el.getBoundingClientRect();const sides=(p:string,s='')=>['Top','Right','Bottom','Left'].map(x=>px(cs.getPropertyValue(`${p}-${x.toLowerCase()}${s}`)));
 return{width:Math.round(r.width*10)/10,height:Math.round(r.height*10)/10,margin:sides('margin'),border:sides('border','-width'),padding:sides('padding')};}
export function ElementMetrics({node,version}:{node:EditorNode;version:unknown}){
 const [m,setM]=useState<Metrics|null>(null);
 useEffect(()=>{const run=()=>setM(measureNode((document.querySelector('iframe[title="Sandboxed design preview"]') as HTMLIFrameElement|null)?.contentDocument,node.id));run();const t=window.setTimeout(run,250);return()=>window.clearTimeout(t);},[node.id,version]);
 const attrs=Object.entries(node.attrs);
 const box=(label:string,v:number[],cls:string,inner:React.ReactNode)=><div className={`flex flex-col items-center gap-1 rounded-md border border-dashed p-1.5 text-[10px] ${cls}`}><span className="self-start uppercase tracking-[.08em] text-ink-2">{label}</span><div className="flex w-full items-center justify-between gap-1 font-mono"><span>{v[3]}</span><div className="flex flex-1 flex-col items-center gap-1"><span>{v[0]}</span>{inner}<span>{v[2]}</span></div><span>{v[1]}</span></div></div>;
 return <section className="border-b border-subtle px-5 py-3" aria-label="Element metrics" data-testid="element-metrics">
  <div className="mb-2 text-[10px] uppercase tracking-[.08em] text-ink-2">Size</div>
  <div className="mb-3 font-mono text-[11px]" data-testid="metrics-size">{m?`${m.width} × ${m.height} px`:'Not rendered'}</div>
  {m&&<div className="mb-3" data-testid="metrics-box">{box('margin',m.margin,'border-ink-2/40',box('border',m.border,'border-ink-2/60',box('padding',m.padding,'border-ink-2/40',<span className="font-mono">{m.width-m.padding[1]-m.padding[3]-m.border[1]-m.border[3]} × {m.height-m.padding[0]-m.padding[2]-m.border[0]-m.border[2]}</span>)))}</div>}
  <div className="mb-1 text-[10px] uppercase tracking-[.08em] text-ink-2">Attributes</div>
  {attrs.length?<ul className="m-0 list-none p-0 font-mono text-[11px]" data-testid="metrics-attrs">{attrs.map(([k,v])=><li key={k} className="flex gap-2"><span className="text-ink-2">{k}</span><span className="break-all">{String(v)}</span></li>)}</ul>:<div className="text-[11px] text-ink-2">None</div>}
 </section>;}
