import type {DecodedSource} from './mix';
import {ARRANGE_LIMITS} from './arrangement';
/** Reads the engine's PCM WAV output, never compressed media. Bounds checked before allocation. */
export function decodeSessionWav(id:string,bytes:ArrayBuffer):DecodedSource{
 const v=new DataView(bytes),tag=(at:number)=>String.fromCharCode(...new Uint8Array(bytes,at,4));if(bytes.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('Session source must be a rendered WAV');
 let format=0,channels=0,rate=0,bits=0,align=0,data=0,size=0;
 for(let at=12;at+8<=bytes.byteLength;){const length=v.getUint32(at+4,true),next=at+8+length;if(next>bytes.byteLength)throw Error('Truncated WAV');const t=tag(at);if(t==='fmt '){if(length<16)throw Error('Invalid WAV format');format=v.getUint16(at+8,true);channels=v.getUint16(at+10,true);rate=v.getUint32(at+12,true);align=v.getUint16(at+20,true);bits=v.getUint16(at+22,true);}if(t==='data'){data=at+8;size=length;}at=next+(length%2);}
 if(!data||!size||![1,2].includes(channels)||rate<8000||rate>192000||!((format===1&&[16,24,32].includes(bits))||(format===3&&bits===32))||align!==channels*bits/8||size%align)throw Error('Unsupported session WAV');
 const frames=size/align;if(frames*channels>ARRANGE_LIMITS.sourceFrames)throw Error('Decoded source exceeds session memory budget');const pcm=Array.from({length:channels},()=>new Float32Array(frames));for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const at=data+i*align+c*bits/8;let n=0;if(format===3)n=v.getFloat32(at,true);else if(bits===16)n=v.getInt16(at,true)/32768;else if(bits===32)n=v.getInt32(at,true)/2147483648;else{let x=v.getUint8(at)|(v.getUint8(at+1)<<8)|(v.getUint8(at+2)<<16);if(x&0x800000)x-=0x1000000;n=x/8388608;}if(!Number.isFinite(n))throw Error('Invalid audio samples');pcm[c][i]=n;}
 return{id,sampleRate:rate,channels:pcm};
}
/** Writes the engine-compatible PCM WAV: float32, 1-2 channels, same bounds as the decoder. */
export function encodeSessionWav(channels:Float32Array[],sampleRate:number):ArrayBuffer{
 if(![1,2].includes(channels.length)||sampleRate<8000||sampleRate>192000)throw Error('Unsupported source format');
 const frames=channels[0].length;if(!frames||channels.some(c=>c.length!==frames))throw Error('Channel length mismatch');
 if(frames*channels.length>ARRANGE_LIMITS.sourceFrames)throw Error('Source exceeds session memory budget');
 const out=new ArrayBuffer(44+frames*channels.length*4),v=new DataView(out);
 const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,out.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,channels.length,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels.length*4,true);v.setUint16(32,channels.length*4,true);v.setUint16(34,32,true);text(36,'data');v.setUint32(40,frames*channels.length*4,true);
 for(let i=0;i<frames;i++)for(let c=0;c<channels.length;c++)v.setFloat32(44+(i*channels.length+c)*4,channels[c][i],true);
 return out;
}
/** Reversed copy of a decoded source under a new id; the input stays untouched. */
export function reverseSource(source:DecodedSource,id:string):DecodedSource{
 return{id,sampleRate:source.sampleRate,channels:source.channels.map(c=>Float32Array.from(c).reverse())};
}
