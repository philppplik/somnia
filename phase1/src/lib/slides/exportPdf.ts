import {EXPORT_MAX_BYTES,EXPORT_MAX_SLIDES} from './exportPng';
const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];

/** A safe PDF name from the presentation name: `<name>.pdf`. */
export function exportPdfName(name:string):string{
  const base=name.replace(/^.*[\\/]/,'').replace(/\.pptx$/i,'').replace(/[^\p{L}\p{N}._-]+/gu,'_').replace(/^[._]+|[._]+$/g,'').slice(0,80);
  return `${base||'slides'}.pdf`;
}

/**
 * One PDF page per rendered slide PNG, sized at the slide's point dimensions so the PDF
 * prints at the presentation's physical size. Pages are raster images: text stays pixels,
 * matching what the engine renders, and hidden slides are included like in the PNG export.
 */
export async function buildSlidesPdf(pngs:readonly Uint8Array[],widthPt:number,heightPt:number):Promise<Uint8Array>{
  if(!pngs.length)throw Error('There are no slides to export');
  if(pngs.length>EXPORT_MAX_SLIDES)throw Error(`At most ${EXPORT_MAX_SLIDES} slides can be exported at once`);
  if(!Number.isFinite(widthPt)||!Number.isFinite(heightPt)||widthPt<=0||heightPt<=0)throw Error('Slide size is not readable');
  let total=0;
  pngs.forEach((png,i)=>{
    if(png.length<PNG_SIGNATURE.length||PNG_SIGNATURE.some((b,k)=>png[k]!==b))throw Error(`Slide ${i+1} did not render as a PNG image`);
    total+=png.length;if(total>EXPORT_MAX_BYTES)throw Error('The slide images are too large to export at once');
  });
  const {PDFDocument}=await import('pdf-lib');
  const pdf=await PDFDocument.create();
  pdf.setTitle(exportPdfName('slides'));
  for(const png of pngs){
    const image=await pdf.embedPng(png);
    const page=pdf.addPage([widthPt,heightPt]);
    page.drawImage(image,{x:0,y:0,width:widthPt,height:heightPt});
  }
  return pdf.save();
}
