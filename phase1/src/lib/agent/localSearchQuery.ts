export const LOCAL_SEARCH_QUERY_BYTES=4096;
export function localSearchQueryReview(text:string):{bytes:number;valid:boolean;reason:'empty'|'invalid'|'oversized'|null}{
 if(typeof text!=='string')return {bytes:0,valid:false,reason:'invalid'};const bytes=new TextEncoder().encode(text).length;
 const reason=!text.trim()?'empty':/[\uD800-\uDFFF\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)?'invalid':bytes>LOCAL_SEARCH_QUERY_BYTES?'oversized':null;
 return {bytes,valid:reason===null,reason};
}
