/** Small generated fixtures shared by tests and the manual Chromium inspection harness. */
import { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib';
export async function createImportFixture(): Promise<Uint8Array> {
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  const p=doc.addPage([400,300]);
  p.drawText('Somnia PDF import', {x:30,y:250,size:24,font,color:rgb(0.1,0.15,0.3)});
  p.drawRectangle({x:30,y:150,width:120,height:60,color:rgb(0.2,0.4,0.8)});
  p.drawSvgPath('M 0 0 C 20 -30 60 -30 80 0', {x:190,y:185,borderColor:rgb(0.8,0.2,0.4),borderWidth:3});
  // One red and one green pixel, PNG constructed in-memory by the test/harness caller is unnecessary.
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwHwQBEfgD/XhT7a4AAAAASUVORK5CYII='), c=>c.charCodeAt(0));
  const image=await doc.embedPng(png);
  p.drawImage(image,{x:220,y:50,width:120,height:60});
  const p2=doc.addPage([300,400]);p2.setRotation(degrees(90));p2.setCropBox(10,20,250,350);
  p2.drawText('Rotated + cropped page',{x:25,y:250,size:16,font});
  p2.pushOperators(pushGraphicsState(),concatTransformationMatrix(1,0,0,1,20,30));
  p2.drawRectangle({x:40,y:70,width:90,height:45,borderWidth:2,borderColor:rgb(0.2,0.5,0.3)});
  p2.pushOperators(popGraphicsState());
  return doc.save();
}
