import { PDFDocument, StandardFonts } from "pdf-lib";
export async function pdfEditFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const p = doc.addPage([460, 600]);
    p.drawText("Somnia / PDF edit verification", {
      x: 35,
      y: 540,
      size: 21,
      font,
    });
    p.drawText(`Source page ${i + 1}`, { x: 35, y: 510, size: 12, font });
    p.drawText("Keep the original. Export a separate copy.", {
      x: 35,
      y: 460,
      size: 16,
      font,
    });
    p.drawText("Highlight this sentence.", { x: 35, y: 415, size: 16, font });
    p.drawText("Remove this old wording.", { x: 35, y: 370, size: 16, font });
  }
  const f = doc.getForm();
  const name = f.createTextField("Customer");
  name.addToPage(doc.getPage(0), { x: 35, y: 250, width: 220, height: 28 });
  name.setText("Original name");
  const accepted = f.createCheckBox("Accepted");
  accepted.addToPage(doc.getPage(0), { x: 35, y: 215, width: 18, height: 18 });
  const region = f.createDropdown("Region");
  region.addOptions(["DE", "FR", "ES"]);
  region.addToPage(doc.getPage(0), { x: 35, y: 170, width: 120, height: 25 });
  region.select("DE");
  return doc.save();
}
