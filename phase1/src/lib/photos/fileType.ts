/** Coarse photo file type from the sniffed MIME: what the app actually imports (no RAW - it has no RAW pipeline). */
export type PhotoFileType='jpeg'|'png'|'webp'|'psd'|'other';
export function photoFileType(mime:string):PhotoFileType{
 if(mime==='image/jpeg')return'jpeg';
 if(mime==='image/png')return'png';
 if(mime==='image/webp')return'webp';
 if(mime==='image/vnd.adobe.photoshop')return'psd';
 return'other';
}
