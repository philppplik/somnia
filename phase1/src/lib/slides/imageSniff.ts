/** Header-only image check: format, pixel size and byte limits. No decoding, so malformed input fails before it reaches a package. */
export interface ImageInfo {ext:'png'|'jpeg';mime:'image/png'|'image/jpeg';width:number;height:number}
export const MAX_IMAGE_BYTES=10*1024*1024,MAX_IMAGE_DIM=16384,MAX_IMAGE_PIXELS=64_000_000;
const u32=(b:Uint8Array,i:number)=>((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0;
const u16=(b:Uint8Array,i:number)=>(b[i]<<8)|b[i+1];
export function sniffImage(b:Uint8Array):ImageInfo{
  if(!(b instanceof Uint8Array)||b.length<24)throw Error('Choose a PNG or JPEG image');
  if(b.length>MAX_IMAGE_BYTES)throw Error('Image exceeds the 10 MiB limit');
  let ext:'png'|'jpeg',width=0,height=0;
  if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a&&b[6]===0x1a&&b[7]===0x0a){
    if(u32(b,8)!==13||String.fromCharCode(b[12],b[13],b[14],b[15])!=='IHDR')throw Error('PNG header is damaged');
    ext='png';width=u32(b,16);height=u32(b,20);
  }else if(b[0]===0xff&&b[1]===0xd8){
    ext='jpeg';let i=2;
    while(i+4<=b.length){
      if(b[i]!==0xff){i++;continue;}
      const m=b[i+1];if(m===0xff){i++;continue;}
      if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
      const len=u16(b,i+2);if(len<2)throw Error('JPEG header is damaged');
      if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc){if(i+9>b.length)throw Error('JPEG header is damaged');height=u16(b,i+5);width=u16(b,i+7);break;}
      if(m===0xda)break;
      i+=2+len;
    }
  }else throw Error('Only PNG and JPEG images are supported');
  if(!width||!height)throw Error('Image size could not be read');
  if(width>MAX_IMAGE_DIM||height>MAX_IMAGE_DIM||width*height>MAX_IMAGE_PIXELS)throw Error('Image is larger than 16384 px per side or 64 megapixels');
  return {ext,mime:ext==='png'?'image/png':'image/jpeg',width,height};
}
/** Alt text from a file name: no extension, no control characters, at most 200 characters. */
export const altFromName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.[^.]*$/,'').replace(/[\u0000-\u001f\u007f<>&"]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
/** Commands carry JSON, so image bytes travel as base64. Both directions are bounded by MAX_IMAGE_BYTES. */
export const MAX_IMAGE_BASE64=Math.ceil(MAX_IMAGE_BYTES/3)*4;
export function encodeBase64(b:Uint8Array):string{let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(s);}
export function decodeBase64(s:string):Uint8Array{
  if(typeof s!=='string'||s.length>MAX_IMAGE_BASE64||s.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Image data is not valid base64');
  const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;
}
