import {useSyncExternalStore} from 'react';
import {SlidesClient} from './client';
import {assertPptx,type DeckSummary} from './protocol';
interface SlidesSession {name:string;summary:DeckSummary|null;index:number;image:string;texts:string[];busy:boolean;error:string;original:Uint8Array|null}
let state:SlidesSession={name:'',summary:null,index:0,image:'',texts:[],busy:false,error:'',original:null};
let client:SlidesClient|null=null,epoch=0,renderSequence=0;
const listeners=new Set<()=>void>();
function patch(p:Partial<SlidesSession>){state={...state,...p};listeners.forEach(f=>f());}
export const useSlidesSession=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},()=>state,()=>state);
export function closeSlides(){epoch++;client?.dispose();client=null;if(state.image)URL.revokeObjectURL(state.image);patch({name:'',summary:null,index:0,image:'',texts:[],busy:false,error:'',original:null});}
export async function openSlides(file:File){
 try{assertPptx(file);}catch(e){patch({error:String(e)});return;}
 closeSlides();const token=epoch;patch({name:file.name,busy:true});
 try{const bytes=new Uint8Array(await file.arrayBuffer());if(token!==epoch)return;client=new SlidesClient();const summary=await client.open(bytes);if(token!==epoch)return;patch({summary,original:bytes});await showSlide(0,token);}
 catch(e){if(token===epoch){client?.dispose();client=null;patch({error:String(e),busy:false});}}
}
export async function showSlide(index:number,token=epoch){const c=client;const summary=state.summary;const renderToken=++renderSequence;if(!c||!summary||index<0||index>=summary.slides||token!==epoch)return;patch({busy:true,error:''});
 try{const scale=Math.min(1.5,1280/summary.widthPt,720/summary.heightPt);const png=await c.render(index,scale);const text=await c.read(index);if(token!==epoch||renderToken!==renderSequence)return;const url=URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}));if(state.image)URL.revokeObjectURL(state.image);patch({index,image:url,texts:text.texts,busy:false});}
 catch(e){if(token===epoch)patch({error:String(e),busy:false});}
}
