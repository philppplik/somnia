const escXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const cleanMeta=(s:string)=>s.replace(/[\r\n]+/g,' ').trim().slice(0,512);
/** SVG accessibility metadata: replaces or inserts <title> and <desc> right after the root tag. Empty fields leave the SVG untouched. */
export function injectSvgMetadata(svg:string,meta:{title:string;description:string}):string{
 const t=cleanMeta(meta.title),d=cleanMeta(meta.description);
 let out=svg;
 if(t)out=/<title>.*?<\/title>/s.test(out)?out.replace(/<title>.*?<\/title>/s,`<title>${escXml(t)}</title>`):out.replace(/<svg[^>]*>/,m=>m+`<title>${escXml(t)}</title>`);
 if(d)out=/<desc>.*?<\/desc>/s.test(out)?out.replace(/<desc>.*?<\/desc>/s,`<desc>${escXml(d)}</desc>`):out.replace(/(<svg[^>]*>(?:<title>[^]*?<\/title>)?)/,'$1'+`<desc>${escXml(d)}</desc>`);
 return out;
}
