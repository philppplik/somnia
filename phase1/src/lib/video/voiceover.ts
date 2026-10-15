/**
 * Voiceover recording for the video studio: the pure decisions behind the Record button. The getUserMedia /
 * MediaRecorder plumbing lives in the workspace component; everything here is unit-testable.
 */

/** Container/codec candidates in preference order: opus in WebM where available, MP4 audio for the macOS webview. */
export const VOICEOVER_MIME_CANDIDATES=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/aac'] as const;

/** First candidate the platform's MediaRecorder accepts, or '' to let the recorder pick its default. */
export const pickVoiceoverMime=(isSupported:(mimeType:string)=>boolean):string=>VOICEOVER_MIME_CANDIDATES.find(isSupported)??'';

/** File extension matching the recorded container (MP4 audio lands as .m4a). */
export const voiceoverExtension=(mime:string):string=>mime.includes('mp4')?'m4a':mime.includes('aac')?'aac':'webm';

/** A free voiceover file name: voiceover.webm, voiceover-2.webm, voiceover-3.webm, ... */
export const voiceoverFileName=(existing:readonly string[],ext:string):string=>{
 const taken=new Set(existing.map(n=>n.toLowerCase()));
 if(!taken.has(`voiceover.${ext}`))return `voiceover.${ext}`;
 for(let i=2;;i++){
  const name=`voiceover-${i}.${ext}`;
  if(!taken.has(name.toLowerCase()))return name;
 }
};
