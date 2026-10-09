/** Video containers the Video Studio accepts. Preview uses the platform's own <video>; export uses WebCodecs. */
export const VIDEO_EXTENSIONS='mp4|m4v|mov|webm|mkv';
export const VIDEO_FILE=new RegExp(`\\.(${VIDEO_EXTENSIONS})$`,'i');
export interface VideoSniff{ext:string;mime:string}
const ascii=(b:Uint8Array,at:number,s:string)=>[...s].every((c,i)=>b[at+i]===c.charCodeAt(0));
const text=(b:Uint8Array)=>Array.from(b).map(c=>String.fromCharCode(c)).join('');
/** Looks at the first bytes so a renamed file is not treated as video (and a misnamed one still is). */
export function sniffVideo(b:Uint8Array):VideoSniff|null{
 if(b.length<12)return null;
 // ISO Base Media (MP4/MOV/M4V): box size (4 bytes) then the literal 'ftyp' and a major brand.
 if(ascii(b,4,'ftyp')){
  const brand=text(b.slice(8,12));
  if(brand==='qt  ')return{ext:'mov',mime:'video/quicktime'};
  if(brand==='M4V '||brand==='M4VH'||brand==='M4VP')return{ext:'m4v',mime:'video/x-m4v'};
  return{ext:'mp4',mime:'video/mp4'};
 }
 // EBML (WebM and Matroska share the magic); the DocType in the header tells them apart.
 if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3){
  const head=text(b.slice(0,Math.min(b.length,512)));
  if(head.includes('webm'))return{ext:'webm',mime:'video/webm'};
  return{ext:'mkv',mime:'video/x-matroska'};
 }
 return null;
}
export const fileExtension=(name:string)=>name.split('.').pop()?.toLowerCase()??'';
