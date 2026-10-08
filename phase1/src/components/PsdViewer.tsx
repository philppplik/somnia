import {useEffect,useRef,useState} from 'react';
import type {MediaItem} from '../lib/media';
import {CraftEngine} from '../lib/craft/engine';
interface Info{width:number;height:number;layers:{name:string}[];warning:string}
/** Read-only merged preview: the original bytes remain unchanged in the media store. */
export function PsdViewer({item}:{item:MediaItem}){
 const canvas=useRef<HTMLCanvasElement>(null);const [info,setInfo]=useState<Info|null>(null);const [error,setError]=useState('');
 useEffect(()=>{const engine=new CraftEngine();const ac=new AbortController();
 void (async()=>{try{if(item.size>16*1024*1024)throw Error('PSD preview is limited to 16 MB.');await engine.init();const bytes=await fetch(item.url,{signal:ac.signal}).then(r=>r.arrayBuffer());if(ac.signal.aborted)return;const result=await engine.readPsd(bytes);if(ac.signal.aborted)return;if(!result.ok||result.kind!=='psd')throw Error('Invalid PSD preview response');const data:Info=JSON.parse(result.query);const c=canvas.current;if(!c)return;c.width=data.width;c.height=data.height;const ctx=c.getContext('2d');if(!ctx||result.bytes.byteLength!==data.width*data.height*4)throw Error('Invalid PSD preview pixels');ctx.putImageData(new ImageData(new Uint8ClampedArray(result.bytes),data.width,data.height),0,0);setInfo(data);}catch(e){if(!ac.signal.aborted)setError(e instanceof Error?e.message:String(e));}finally{engine.dispose();}})();
 return()=>{ac.abort();engine.dispose();};},[item.url,item.size]);
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label="Read-only PSD preview"><div className="media-bar border-b border-subtle px-3 py-2 text-sm">{item.name} - PSD read-only {info&&`${info.width} x ${info.height} px`}</div><p className="px-3 py-2 text-sm" role={error?'alert':'status'}>{error||info?.warning||'Reading bounded PSD composite...'}</p><div className="flex min-h-0 flex-1 overflow-auto gap-4 p-4"><div className="flex-1 grid place-items-center"><canvas ref={canvas} hidden={!info} data-testid="psd-preview" className="media-checker max-w-full"/></div>{info&&<aside className="w-52 text-sm" aria-label="PSD layer metadata"><h2>Layer names (not imported)</h2>{info.layers.length?<ul>{info.layers.map((l,i)=><li key={i} className="break-all py-1">{l.name}</li>)}</ul>:<p>No layer records</p>}</aside>}</div></section>;
}
