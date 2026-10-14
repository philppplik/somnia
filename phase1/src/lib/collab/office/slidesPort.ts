import type {SlidesClient} from '../../slides/client';
import type {SlidesEnginePort} from './slidesBinding';
import type {SlidesOpKind} from './slidesModel';
/**
 * Dispatch from journal ops to the slides worker client. `cleanSlidesOp` already whitelisted the
 * kind and bounded the args; the casts below are the one place op payloads meet the typed client.
 * Picture ops stay out of CO3 (inline bytes do not belong in the journal).
 */
export function slidesClientPort(client:SlidesClient):SlidesEnginePort{
 const run=(bytes:Uint8Array,fn:SlidesOpKind,a:unknown[]):Promise<Uint8Array>=>{
  switch(fn){
   case 'slideEdit':return client.slideEdit(bytes,a[0] as 'duplicate'|'delete',a[1] as number);
   case 'reorder':return client.reorder(bytes,a[0] as number,a[1] as number);
   case 'shapeBounds':return client.shapeBounds(bytes,a[0] as number,a[1] as number,a[2] as never,a[3] as never);
   case 'shapesBounds':return client.shapesBounds(bytes,a[0] as number,a[1] as never);
   case 'arrange':return client.arrange(bytes,a[0] as number,a[1] as number[],a[2] as never);
   case 'table':return client.editTable(bytes,a[0] as number,a[1] as number,a[2] as never);
   case 'style':return client.styleShapes(bytes,a[0] as number,a[1] as number[],a[2] as never);
   case 'notes':return client.setNotes(bytes,a[0] as number,a[1] as string[]);
   case 'group':return client.group(bytes,a[0] as number,a[1] as number[]);
   case 'ungroup':return client.ungroup(bytes,a[0] as number,a[1] as number);
   case 'transition':return client.setTransition(bytes,a[0] as number,a[1] as never);
   case 'formatText':return client.formatText(bytes,a[0] as number,a[1] as number,a[2] as never);
   case 'boxEdit':return a[0]==='add'?client.addBox(bytes,a[1] as number,a[2] as string):client.removeBox(bytes,a[1] as number,a[2] as number);
   case 'newSlide':return client.newSlide(bytes,a[0] as string,(a[1]??null) as number|null);
   case 'textEdits':return client.copy(bytes,a[0] as never);
  }
 };
 return{apply:(fn,bytes,args)=>run(bytes,fn,args)};
}
