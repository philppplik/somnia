import http from 'node:http';
import {discoveryOrigin,discoveryPath,parseDiscoveredModels,type DiscoveryRuntime} from '../../src/lib/agent/localRuntimeDiscovery';
export async function discoverModels(runtime:DiscoveryRuntime,raw:string){
 const origin=discoveryOrigin(raw),path=discoveryPath(runtime);
 const value=await new Promise<unknown>((resolve,reject)=>{
  // Node http direct connection: no ambient proxy, no redirects, no external credentials.
  const request=http.get(origin+path,{timeout:5000},response=>{
   if(response.statusCode!==200){response.resume();reject(Error('Runtime answered '+response.statusCode));return;}
   let size=0;const chunks:Buffer[]=[];response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){request.destroy(Error('Runtime inventory too large'));return;}chunks.push(chunk);});
   response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('Invalid runtime JSON'));}});
   response.on('error',()=>reject(Error('Runtime response interrupted')));
  });
  const timer=setTimeout(()=>request.destroy(Error('Runtime inspection timed out')),5000);
  request.on('timeout',()=>request.destroy(Error('Runtime inspection timed out')));request.on('error',()=>reject(Error('Runtime unreachable; start it manually and retry')));request.on('close',()=>clearTimeout(timer));
 });
 return {schema:'somnia.local-models/1',runtime,endpoint:origin,models:parseDiscoveredModels(runtime,value),inferenceVerified:false};
}
export async function modelDiscoveryMain(args:string[]):Promise<void>{
 try{
  if(args.length!==2)throw Error('models expects runtime and HTTP loopback origin');
  const runtime=args[0] as DiscoveryRuntime;const result=await discoverModels(runtime,args[1]);
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){process.stdout.write(JSON.stringify({schema:'somnia.local-models/1',error:error instanceof Error?error.message:'Discovery failed'})+'\n');process.exitCode=1;}
}
