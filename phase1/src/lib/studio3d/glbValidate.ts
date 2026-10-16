/** Structural checks for an exported GLB (glTF 2.0 binary), run on the exporter output before the download starts. Pure and node-testable. This catches a broken container and out-of-range references; it is not a full glTF schema validator. */
export interface GlbProblem{code:'magic'|'version'|'length'|'chunk'|'json'|'buffer'|'bufferView'|'accessor'|'indices'|'reference';detail:string}

const COMP:Record<number,number>={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const NCOMP:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const TEX_REFS=['baseColorTexture','metallicRoughnessTexture','normalTexture','occlusionTexture','emissiveTexture'] as const;

export function validateGlb(data:Uint8Array):GlbProblem[]{
 const out:GlbProblem[]=[];
 const bad=(code:GlbProblem['code'],detail:string)=>{out.push({code,detail});};
 if(data.byteLength<12){bad('length','the file is shorter than the 12-byte GLB header');return out;}
 const dv=new DataView(data.buffer,data.byteOffset,data.byteLength);
 if(dv.getUint32(0,true)!==0x46546c67){bad('magic','missing glTF magic');return out;}
 if(dv.getUint32(4,true)!==2)bad('version',`GLB version ${dv.getUint32(4,true)} is not 2`);
 if(dv.getUint32(8,true)!==data.byteLength)bad('length',`the header declares ${dv.getUint32(8,true)} bytes, the file has ${data.byteLength}`);
 let json:unknown=null,bin:Uint8Array|null=null,off=12;
 for(let c=0;off+8<=data.byteLength&&c<2;c++){
  const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true);
  if(off+8+len>data.byteLength){bad('chunk',`chunk ${c} overruns the file`);break;}
  if(c===0&&type!==0x4e4f534a)bad('chunk','the first chunk is not JSON');
  if(type===0x4e4f534a){try{json=JSON.parse(new TextDecoder().decode(data.subarray(off+8,off+8+len)));}catch{bad('json','the JSON chunk does not parse');}}
  else if(type===0x004e4942)bin=data.subarray(off+8,off+8+len);
  off+=8+len;
 }
 if(json==null){bad('json','there is no JSON chunk');return out;}
 const g=json as Record<string,unknown>;
 const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
 const buffers=arr(g.buffers) as {byteLength?:number;uri?:string}[];
 const views=arr(g.bufferViews) as {buffer?:number;byteOffset?:number;byteLength?:number;byteStride?:number}[];
 const accs=arr(g.accessors) as {bufferView?:number;byteOffset?:number;componentType?:number;count?:number;type?:string;min?:unknown[];max?:unknown[]}[];
 const nodes=arr(g.nodes) as {mesh?:number;children?:number[]}[];
 buffers.forEach((b,i)=>{
  if(b.uri)return; // external buffers are not part of the GLB payload
  if(!bin)bad('buffer',`buffer ${i} has no uri but the GLB has no BIN chunk`);
  else if((b.byteLength??0)>bin.byteLength)bad('buffer',`buffer ${i} declares ${b.byteLength} bytes, the BIN chunk holds ${bin.byteLength}`);
 });
 views.forEach((v,i)=>{
  const buf=v.buffer??0;
  const blen=buf<buffers.length?(buffers[buf].byteLength??0):(bin?bin.byteLength:0);
  if(buffers.length&&buf>=buffers.length)bad('reference',`bufferView ${i} points at missing buffer ${buf}`);
  if((v.byteOffset??0)+(v.byteLength??0)>blen)bad('bufferView',`bufferView ${i} overruns its buffer (${(v.byteOffset??0)+(v.byteLength??0)} > ${blen})`);
 });
 accs.forEach((a,i)=>{
  const es=(COMP[a.componentType??0]??0)*(NCOMP[a.type??'']??0);
  if(!COMP[a.componentType??0])bad('accessor',`accessor ${i} has unknown componentType ${a.componentType}`);
  const nc=NCOMP[a.type??''];
  if(!nc)bad('accessor',`accessor ${i} has unknown type ${a.type}`);
  for(const mm of['min','max'] as const){const m=a[mm];if(m&&Array.isArray(m)&&nc&&m.length!==nc)bad('accessor',`accessor ${i} ${mm} has ${m.length} components, expected ${nc}`);}
  if(a.bufferView===undefined)return; // zero-filled accessor: allowed
  const v=views[a.bufferView];
  if(!v){bad('reference',`accessor ${i} points at missing bufferView ${a.bufferView}`);return;}
  const stride=v.byteStride??es;
  if(es&&stride<es)bad('accessor',`accessor ${i} byteStride ${stride} is below its element size ${es}`);
  if((a.count??0)>0&&es){
   const need=(a.byteOffset??0)+stride*(a.count!-1)+es;
   if(need>(v.byteLength??0))bad('accessor',`accessor ${i} overruns its bufferView (${need} > ${v.byteLength})`);
  }
 });
 const indexMax=(ai:number):number|null=>{
  const a=accs[ai];
  if(!a||!bin||a.bufferView===undefined)return null;
  const v=views[a.bufferView];if(!v)return null;
  const base=(v.byteOffset??0)+(a.byteOffset??0),n=a.count??0;
  let mx=-1;
  try{
   if(a.componentType===5121)for(let k=0;k<n;k++)mx=Math.max(mx,bin[base+k]);
   else if(a.componentType===5123){const u=new Uint16Array(bin.buffer,bin.byteOffset+base,n);for(let k=0;k<n;k++)mx=Math.max(mx,u[k]);}
   else if(a.componentType===5125){const u=new Uint32Array(bin.buffer,bin.byteOffset+base,n);for(let k=0;k<n;k++)mx=Math.max(mx,u[k]);}
   else return null;
  }catch{return null;}
  return mx;
 };
 (arr(g.meshes) as {primitives?:{attributes?:Record<string,number>;indices?:number}[]}[]).forEach((m,mi)=>(m.primitives??[]).forEach((p,pi)=>{
  const attrs=p.attributes??{};
  for(const[k,ai]of Object.entries(attrs))if(ai<0||ai>=accs.length)bad('reference',`mesh ${mi} primitive ${pi} attribute ${k} points at missing accessor ${ai}`);
  if(p.indices!==undefined){
   if(p.indices<0||p.indices>=accs.length)bad('reference',`mesh ${mi} primitive ${pi} indices point at missing accessor ${p.indices}`);
   else{
    const pos=attrs.POSITION;
    if(pos!==undefined&&pos>=0&&pos<accs.length){
     const mx=indexMax(p.indices),pc=accs[pos].count??0;
     if(mx!=null&&mx>=pc)bad('indices',`mesh ${mi} primitive ${pi} index ${mx} is outside the ${pc} vertices`);
    }
   }
  }
 }));
 nodes.forEach((n,i)=>{
  if(n.mesh!==undefined&&n.mesh>=arr(g.meshes).length)bad('reference',`node ${i} points at missing mesh ${n.mesh}`);
  for(const c of n.children??[])if(c<0||c>=nodes.length)bad('reference',`node ${i} child ${c} is out of range`);
 });
 (arr(g.scenes) as {nodes?:number[]}[]).forEach((s2,i)=>{for(const r of s2.nodes??[])if(r<0||r>=nodes.length)bad('reference',`scene ${i} root node ${r} is out of range`);});
 const images=arr(g.images) as {bufferView?:number}[];
 (arr(g.textures) as {source?:number}[]).forEach((t,i)=>{if(t.source!==undefined&&t.source>=images.length)bad('reference',`texture ${i} points at missing image ${t.source}`);});
 images.forEach((im,i)=>{if(im.bufferView!==undefined&&im.bufferView>=views.length)bad('reference',`image ${i} points at missing bufferView ${im.bufferView}`);});
 (arr(g.materials) as Record<string,unknown>[]).forEach((mt,i)=>{
  const walk=(o:unknown,path:string)=>{
   if(!o||typeof o!=='object')return;
   for(const k of TEX_REFS){const t2=(o as Record<string,unknown>)[k] as {index?:number}|undefined;if(t2&&typeof t2.index==='number'&&t2.index>=arr(g.textures).length)bad('reference',`material ${i} ${path}.${k} points at missing texture ${t2.index}`);}
  };
  walk(mt,'');walk(mt.pbrMetallicRoughness,'pbrMetallicRoughness');
 });
 (arr(g.animations) as {samplers?:{input:number;output:number}[];channels?:{sampler:number;target?:{node?:number}}[]}[]).forEach((an,i)=>{
  (an.samplers??[]).forEach((sm,si)=>{if(sm.input>=accs.length||sm.output>=accs.length)bad('reference',`animation ${i} sampler ${si} points at a missing accessor`);});
  (an.channels??[]).forEach((ch,ci)=>{
   if(ch.sampler>=(an.samplers??[]).length)bad('reference',`animation ${i} channel ${ci} points at missing sampler ${ch.sampler}`);
   if(ch.target?.node!==undefined&&ch.target.node>=nodes.length)bad('reference',`animation ${i} channel ${ci} targets missing node ${ch.target.node}`);
  });
 });
 return out;
}
