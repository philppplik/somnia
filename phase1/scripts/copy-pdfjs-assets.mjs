// Copies the pdf.js asset directories (standard fonts, CMaps, ICC profiles, wasm decoders) into
// public/pdfjs so they ship with the app. Without them pdf.js renders PDFs that reference
// non-embedded base-14 fonts, CJK CMaps or JBIG2/JPX images with wrong or missing glyphs.
import {cpSync,existsSync} from 'node:fs';
for(const dir of ['standard_fonts','cmaps','wasm','iccs']){
 const src=`node_modules/pdfjs-dist/${dir}`;
 if(!existsSync(src)){console.error(`pdf.js asset directory missing: ${src}`);process.exit(1);}
 cpSync(src,`public/pdfjs/${dir}`,{recursive:true});
}
console.log('pdf.js assets copied to public/pdfjs');
