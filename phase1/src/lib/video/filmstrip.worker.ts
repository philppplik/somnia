/** Filmstrip worker: owns its own mediabunny inputs so thumbnail decoding never contends with the export worker. */
import {decodeThumbs,openSource,type OpenSource} from './filmstrip-decode';
import type {SourceInfo} from './filmstrip-controller';
export type FilmRequest=
 |{id:number;kind:'open';key:string;bytes:ArrayBuffer}
 |{id:number;kind:'thumbs';key:string;times:number[];width:number;height:number}
 |{id:number;kind:'close';key:string};
export type FilmResponse=
 |{id:number;ok:true;kind:'open';info:SourceInfo}
 |{id:number;ok:true;kind:'thumbs';bitmaps:(ImageBitmap|null)[]}
 |{id:number;ok:false;error:string};
const open=new Map<string,Promise<OpenSource>>();
const post=(m:FilmResponse,t:Transferable[]=[])=>(self as unknown as Worker).postMessage(m,t);
self.onmessage=async({data}:MessageEvent<FilmRequest>)=>{
 try{
  if(data.kind==='open'){
   const p=openSource(data.bytes);open.set(data.key,p);
   const s=await p;post({id:data.id,ok:true,kind:'open',info:s.info});
  }else if(data.kind==='thumbs'){
   const s=await open.get(data.key);if(!s)throw new Error('Source is not open');
   const bitmaps=await decodeThumbs(s,data.times,data.width,data.height);
   post({id:data.id,ok:true,kind:'thumbs',bitmaps},bitmaps.filter((b):b is ImageBitmap=>!!b));
  }else{
   const p=open.get(data.key);open.delete(data.key);
   if(p)void p.then(s=>s.input.dispose(),()=>{});
  }
 }catch(e){post({id:data.id,ok:false,error:e instanceof Error?e.message:String(e)});}
};
