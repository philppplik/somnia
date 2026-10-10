import {ExtensionError} from '../contracts/v2/api';
/** Binary preflight before compilation/instantiation. No WASI, threads, shared/memory64 or start function. */
export function validateWasm(bytes:Uint8Array):void {
 const bad=():never=>{throw new ExtensionError('E_INVALID_ARGUMENT','Unsupported or unsafe Wasm ABI.');};
 if(bytes.length>20*1024*1024||bytes.length<8||![0,97,115,109,1,0,0,0].every((v,i)=>bytes[i]===v))bad();
 let i=8;const byte=()=>{if(i>=bytes.length)bad();return bytes[i++];};
 const u=()=>{let n=0,shift=0;for(let k=0;k<5;k++){const b=byte();if(k===4&&(b&0xf0))bad();n+=(b&127)*2**shift;if(!(b&128))return n;shift+=7;}return bad();};
 const name=()=>{const len=u();if(i+len>bytes.length)bad();const s=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(i,i+len));i+=len;return s;};
 const types:{args:number[];results:number[]}[]=[];const functions:number[]=[];const exports=new Map<string,{kind:number;index:number}>();let memories=0,imports=0;const seen=new Set<number>();
 const limits=(memory=false)=>{const flags=u();if(flags!==1)bad();const min=u(),max=u();if(min>max||memory&&max>2048)bad();};
 while(i<bytes.length){const section=byte(),length=u(),end=i+length;if(end>bytes.length||section>12||(section!==0&&seen.has(section)))bad();seen.add(section);
  if(section===1){const count=u();for(let j=0;j<count;j++){if(byte()!==0x60)bad();const a=u();if(a>32)bad();const args=Array.from({length:a},byte);const r=u();if(r>1)bad();const results=Array.from({length:r},byte);if([...args,...results].some(t=>![0x7f,0x7e,0x7d,0x7c].includes(t)))bad();types.push({args,results});}}
  else if(section===2){const count=u();if(count!==1)bad();for(let j=0;j<count;j++){if(name()!=='somnia'||name()!=='emit'||byte()!==0)bad();functions.push(u());imports++;}}
  else if(section===3){const count=u();for(let j=0;j<count;j++)functions.push(u());}
  else if(section===4){const count=u();if(count>1)bad();for(let j=0;j<count;j++){if(byte()!==0x70)bad();limits();}}
  else if(section===5){const count=u();if(count!==1)bad();memories=count;limits(true);}
  else if(section===7){const count=u();for(let j=0;j<count;j++){const n=name();if(exports.has(n))bad();exports.set(n,{kind:byte(),index:u()});}}
  else if(section===8)bad();
  else i=end;
  if(i!==end)bad();
 }
 if(imports!==1||memories!==1)bad();
 const signature=(index:number,args:number[],results:number[])=>{const t=types[functions[index]];if(!t||String(t.args)!==String(args)||String(t.results)!==String(results))bad();};
 signature(0,[0x7f,0x7f],[0x7f]);
 for(const [n,args,results] of [['alloc',[0x7f],[0x7f]],['dealloc',[0x7f,0x7f],[]],['init',[],[0x7f]],['dispatch',[0x7f,0x7f],[0x7f]]] as const){const e=exports.get(n);if(!e||e.kind!==0)bad();signature(e!.index,[...args],[...results]);}
 const memory=exports.get('memory');if(!memory||memory.kind!==2||memory.index!==0)bad();
}
