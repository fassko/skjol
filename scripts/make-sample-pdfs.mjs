// Generates SYNTHETIC sample shipping documents as PDFs (public/samples/*.pdf) from the text fixtures.
// Pages are split on the "------ Page N of M" separator lines used in the .txt fixtures.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const SRC = "fixtures/documents";
const OUT = "public/samples";

for (const f of readdirSync(SRC).filter((x) => x.endsWith(".txt"))) {
  const text = readFileSync(`${SRC}/${f}`, "utf8").replace(/—/g, "-");
  const pages = text.split(/\n-{5,}[^\n]*\n/);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`SYNTHETIC DEMO DOCUMENT - ${f.replace(".txt", "")}`);
  pdf.setProducer("skjol sample generator (synthetic data)");
  const font = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.CourierBold);
  pages.forEach((body, i) => {
    const page = pdf.addPage([595, 842]); // A4
    page.drawText("SYNTHETIC DEMO DOCUMENT - NOT A REAL SHIPMENT", { x: 40, y: 800, size: 10, font: bold, color: rgb(0.75, 0.2, 0.05) });
    let y = 770;
    for (const line of body.split("\n")) {
      if (line.startsWith("SYNTHETIC DEMO DOCUMENT")) continue;
      page.drawText(line.slice(0, 92), { x: 40, y, size: 9.5, font });
      y -= 15;
    }
    page.drawText(`Page ${i + 1} of ${pages.length}`, { x: 480, y: 30, size: 8, font });
  });
  const out = `${OUT}/${f.replace(".txt", ".pdf")}`;
  writeFileSync(out, await pdf.save());
  console.log("wrote", out, `${pages.length} page(s)`);
}
