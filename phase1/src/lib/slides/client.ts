import type {SlidesDiagnostics} from './diagnostics';
import type {TextRun,TextEdit} from './editCopy';
import type {DeckModel,LayoutInfo,BoundsBox,RunFormat,ShapeBoundsEdit,ArrangeMode,SlideTransition,ShapeStylePatch,TableEdit,ThemeEdit} from './deckPackage';
import type {DeckSummary,SlidesReply,SlidesRequest} from './protocol';
type Request=SlidesRequest extends infer R?R extends SlidesRequest?Omit<R,'id'>:never:never;
export class SlidesClient {
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 private next=0;private closed=false;
 private pending=new Map<number,{resolve:(r:SlidesReply['result'])=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(){this.worker.onmessage=({data}:{data:SlidesReply})=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};this.worker.onerror=()=>this.dispose(new Error('Slides worker failed. Close and reopen the presentation.'));}
 private request(data:Request):Promise<SlidesReply['result']>{if(this.closed)return Promise.reject(new Error('Slides worker closed'));return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>this.dispose(new Error('Slides operation exceeded 30 seconds')),30_000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({...data,id});});}
 async open(bytes:Uint8Array):Promise<DeckSummary>{await this.request({op:'init'});return await this.request({op:'open',bytes}) as DeckSummary;}
 async render(index:number,scale:number):Promise<Uint8Array>{return await this.request({op:'render',index,scale}) as Uint8Array;}
 async read(index:number):Promise<{index:number;texts:string[]}>{return await this.request({op:'read',index}) as {index:number;texts:string[]};}
 async memory(){return await this.request({op:'memory'}) as {wasmBytes:number};}
 async diagnostics(bytes:Uint8Array){return await this.request({op:'diagnostics',bytes}) as SlidesDiagnostics;}
 async runs(bytes:Uint8Array){return await this.request({op:'runs',bytes}) as TextRun[];}
 async copy(bytes:Uint8Array,edits:TextEdit[]){return await this.request({op:'copy',bytes,edits}) as Uint8Array;}
 async model(bytes:Uint8Array){return await this.request({op:'model',bytes}) as DeckModel;}
 async reorder(bytes:Uint8Array,slideId:number,toIndex:number){return await this.request({op:'reorder',bytes,slideId,toIndex}) as Uint8Array;}
 async slideEdit(bytes:Uint8Array,kind:'duplicate'|'delete',slideId:number){return await this.request({op:'slideEdit',bytes,kind,slideId}) as Uint8Array;}
 async newSlide(bytes:Uint8Array,layoutPart:string,afterSlideId:number|null){return await this.request({op:'newSlide',bytes,layoutPart,afterSlideId}) as Uint8Array;}
 async shapeBounds(bytes:Uint8Array,slideId:number,shapeId:number,expected:BoundsBox,next:BoundsBox){return await this.request({op:'shapeBounds',bytes,slideId,shapeId,expected,next}) as Uint8Array;}
 async shapesBounds(bytes:Uint8Array,slideId:number,edits:ShapeBoundsEdit[]){return await this.request({op:'shapesBounds',bytes,slideId,edits}) as Uint8Array;}
 async styleShapes(bytes:Uint8Array,slideId:number,shapeIds:number[],patch:ShapeStylePatch){return await this.request({op:'style',bytes,slideId,shapeIds,patch}) as Uint8Array;}
 async insertTable(bytes:Uint8Array,slideId:number,rows:number,cols:number){return await this.request({op:'insertTable',bytes,slideId,rows,cols}) as Uint8Array;}
 async editLayoutBox(bytes:Uint8Array,layoutPart:string,shapeId:number,expected:BoundsBox,next:BoundsBox){return await this.request({op:'layoutBox',bytes,layoutPart,shapeId,expected,next}) as Uint8Array;}
 async editMasterBox(bytes:Uint8Array,shapeId:number,expected:BoundsBox,next:BoundsBox){return await this.request({op:'masterBox',bytes,shapeId,expected,next}) as Uint8Array;}
 async editTheme(bytes:Uint8Array,edit:ThemeEdit){return await this.request({op:'theme',bytes,edit}) as Uint8Array;}
 async editTable(bytes:Uint8Array,slideId:number,shapeId:number,edit:TableEdit){return await this.request({op:'table',bytes,slideId,shapeId,edit}) as Uint8Array;}
 async setNotes(bytes:Uint8Array,slideId:number,lines:string[]){return await this.request({op:'notes',bytes,slideId,lines}) as Uint8Array;}
 async group(bytes:Uint8Array,slideId:number,shapeIds:number[]){return await this.request({op:'group',bytes,slideId,shapeIds}) as Uint8Array;}
 async ungroup(bytes:Uint8Array,slideId:number,shapeId:number){return await this.request({op:'ungroup',bytes,slideId,shapeId}) as Uint8Array;}
 async setTransition(bytes:Uint8Array,slideId:number,transition:SlideTransition){return await this.request({op:'transition',bytes,slideId,transition}) as Uint8Array;}
 async arrange(bytes:Uint8Array,slideId:number,shapeIds:number[],mode:ArrangeMode){return await this.request({op:'arrange',bytes,slideId,shapeIds,mode}) as Uint8Array;}
 async formatText(bytes:Uint8Array,slideId:number,shapeId:number,format:RunFormat){return await this.request({op:'formatText',bytes,slideId,shapeId,format}) as Uint8Array;}
 async addBox(bytes:Uint8Array,slideId:number,label:string){return await this.request({op:'boxEdit',kind:'add',bytes,slideId,label}) as Uint8Array;}
 async removeBox(bytes:Uint8Array,slideId:number,shapeId:number){return await this.request({op:'boxEdit',kind:'remove',bytes,slideId,shapeId}) as Uint8Array;}
 async insertPicture(bytes:Uint8Array,slideId:number,image:Uint8Array,alt:string){return await this.request({op:'pictureEdit',kind:'insert',bytes,slideId,image,alt}) as Uint8Array;}
 async replacePicture(bytes:Uint8Array,slideId:number,shapeId:number,image:Uint8Array){return await this.request({op:'pictureEdit',kind:'replace',bytes,slideId,shapeId,image}) as Uint8Array;}
 async removePicture(bytes:Uint8Array,slideId:number,shapeId:number){return await this.request({op:'pictureEdit',kind:'remove',bytes,slideId,shapeId}) as Uint8Array;}
 async layouts(bytes:Uint8Array){return await this.request({op:'layouts',bytes}) as LayoutInfo[];}
 dispose(error=new Error('Slides operation cancelled')){if(this.closed)return;this.closed=true;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
