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
