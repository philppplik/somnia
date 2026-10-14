import {AgentError,ProviderError} from './errors';
import type {AgentImagePart,AgentProvider,AgentProviderRequest} from './types';
import {OllamaProvider} from './providers/ollama';
export function validateImages(messages:AgentProviderRequest['messages']):number{
 let count=0,total=0;
 for(const message of messages){for(const image of message.images??[]){
  if(message.role!=='user'||!['image/png','image/jpeg'].includes(image.mime)||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width>1024||image.height>1024||image.base64.length>4_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)||image.label.length>200)throw new ProviderError('protocol','Invalid prepared image input');
  count++;total+=image.base64.length;
 }}
 if(count>4||total>12_000_000)throw new ProviderError('protocol','Image input exceeds request limits');return count;
}
/** Fresh locality and capability checks before every real request; metadata is declared, not task tested. */
export function requireLocalCapabilities(provider:OllamaProvider,numCtx?:number):AgentProvider{
 return {id:provider.id,locality:'local',supportsImages:true,async *stream(request){
  const images=validateImages(request.messages);
  request.signal.throwIfAborted();
  const local=await provider.verifyLocalModel(request.model,request.signal);
  if(!local.local)throw new ProviderError('not-local','This request requires verified local model weights');
  if(images&&numCtx===undefined)throw new ProviderError('protocol','Set an explicit requested context before vision use');
  if(request.tools.length||images){
   const capabilities=await provider.capabilities(request.model,request.signal);
   if(request.tools.length&&!capabilities?.includes('tools'))throw new AgentError('tool-unsupported','no-tool-support','Selected local model has no declared tool support. Choose another model or text-only chat.');
   if(images&&!capabilities?.includes('vision'))throw new ProviderError('protocol','Selected local model has no declared vision support');
  }
  yield* provider.stream(request);
 }};
}
/** Decode and re-encode locally to strip metadata; never forwards original bytes. */
export async function prepareImage(file:Blob,label:string):Promise<AgentImagePart>{
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>20_000_000)throw Error('Choose a PNG/JPEG up to 20 MB');
 const image=await createImageBitmap(file);
 try{
  if(image.width<1||image.height<1||image.width*image.height>50_000_000)throw Error('Image dimensions exceed preparation limits');
  const ratio=Math.min(1,1024/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
  const context=canvas.getContext('2d');if(!context)throw Error('Image preparation unavailable');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const base64=canvas.toDataURL('image/jpeg',0.85).split(',')[1];
  const result:AgentImagePart={mime:'image/jpeg',base64,width:canvas.width,height:canvas.height,label:label.slice(0,200)};
  validateImages([{role:'user',content:'',images:[result]}]);return result;
 }finally{image.close();}
}
