/** Audio containers the SoundCraft decoder accepts for the Sound Studio. */
export const AUDIO_EXTENSIONS='mp3|wav|flac|ogg|oga|aif|aiff';
export const AUDIO_FILE=new RegExp(`\\.(${AUDIO_EXTENSIONS})$`,'i');
export interface AudioSniff{ext:string;mime:string}
const ascii=(b:Uint8Array,at:number,s:string)=>[...s].every((c,i)=>b[at+i]===c.charCodeAt(0));
/** Looks at the first bytes so a renamed file is not treated as audio (and a misnamed one still is). */
export function sniffAudio(b:Uint8Array):AudioSniff|null{
 if(b.length<12)return null;
 if(ascii(b,0,'RIFF')&&ascii(b,8,'WAVE'))return{ext:'wav',mime:'audio/wav'};
 if(ascii(b,0,'fLaC'))return{ext:'flac',mime:'audio/flac'};
 if(ascii(b,0,'OggS'))return{ext:'ogg',mime:'audio/ogg'};
 if(ascii(b,0,'FORM')&&(ascii(b,8,'AIFF')||ascii(b,8,'AIFC')))return{ext:'aiff',mime:'audio/aiff'};
 if(ascii(b,0,'ID3'))return{ext:'mp3',mime:'audio/mpeg'};
 // MPEG audio frame sync: 11 set bits, a valid version (not 01) and layer (not 00); ADTS AAC has layer 00.
 if(b[0]===0xff&&(b[1]&0xe0)===0xe0&&((b[1]>>3)&3)!==1&&((b[1]>>1)&3)!==0)return{ext:'mp3',mime:'audio/mpeg'};
 return null;
}
export const fileExtension=(name:string)=>name.split('.').pop()?.toLowerCase()??'';
