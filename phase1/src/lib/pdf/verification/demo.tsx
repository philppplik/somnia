/** Standalone verification harness, not imported by the application. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PdfEditInspector } from "../../../components/pdf/PdfEditInspector";
import {
  createPdfEditDocument,
  commitPdfEdits,
  undoPdfEdits,
  redoPdfEdits,
  applyPdfEditCommand,
  extractPdfPages,
  type PdfEditHistory,
} from "../model";
import { inspectPdfEditSource, exportPdfEdits } from "../export";
import { pdfEditFixture } from "./fixture";
import type { PdfFieldInfo } from "../../pdfforms/types";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.mjs?url";
GlobalWorkerOptions.workerSrc = worker;
const original = await pdfEditFixture();
let initial = createPdfEditDocument(3);
for (const [kind, y, text] of [
  ["highlight", 410, ""],
  ["strikethrough", 365, ""],
  ["freeText", 300, "Review approved."],
] as const)
  initial = applyPdfEditCommand(initial, {
    kind: "annotation.add",
    annotation: {
      id: kind,
      sourcePage: 0,
      kind,
      rect: { x: 30, y, width: 250, height: 30 },
      text,
      color:
        kind === "strikethrough"
          ? [0.8, 0.1, 0.1]
          : kind === "freeText"
            ? [0.15, 0.35, 0.65]
            : [1, 0.85, 0.1],
      opacity: kind === "highlight" ? 0.4 : 1,
      fontSize: 12,
    },
  });
initial = applyPdfEditCommand(initial, {
  kind: "field.set",
  name: "Customer",
  value: "Philipp Paulik",
});
initial = applyPdfEditCommand(initial, {
  kind: "field.set",
  name: "Accepted",
  value: true,
});
const fields = (await inspectPdfEditSource(original)).fields;
async function draw(bytes: Uint8Array, id: string) {
  const loading = getDocument({ data: bytes.slice() });
  const doc = await loading.promise;
  const page = await doc.getPage(1),
    viewport = page.getViewport({ scale: 1.1 }),
    canvas = document.getElementById(id) as HTMLCanvasElement;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  canvas.dataset.rendered = "true";
  await loading.destroy();
}
function Demo() {
  const [h, setH] = useState<PdfEditHistory>({
      present: initial,
      past: [],
      future: [],
    }),
    [active, setActive] = useState(0),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const locale = new URLSearchParams(location.search).get("locale") || "en";
  useEffect(() => {
    void draw(original, "original");
    void exportPdfEdits(original, initial).then((b) => draw(b, "exported"));
  }, []);
  const exportModel = async (model = h.present) => {
    setBusy(true);
    setError(null);
    try {
      await draw(await exportPdfEdits(original, model), "exported");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="layout">
      <div className="preview">
        <header>
          <strong>Somnia · PDF edit verification</strong>
          <span>Metadata-only editing · {locale}</span>
        </header>
        <div className="sheets">
          <article>
            <h2>Original source</h2>
            <canvas id="original" />
          </article>
          <article>
            <h2>Exported copy</h2>
            <canvas id="exported" />
          </article>
        </div>
        <p>
          Original bytes remain unchanged. Real /Annots and AcroForm values are
          rendered by PDF.js.
        </p>
      </div>
      <PdfEditInspector
        document={h.present}
        locale={locale}
        fields={fields as PdfFieldInfo[]}
        activeSourcePage={active}
        onSelectPage={setActive}
        onCommand={(c) => {
          setH(commitPdfEdits(h, c));
          setError(null);
        }}
        onExport={() => void exportModel()}
        onExtract={(pages) =>
          void exportModel(extractPdfPages(h.present, pages))
        }
        onUndo={() => setH(undoPdfEdits(h))}
        onRedo={() => setH(redoPdfEdits(h))}
        canUndo={!!h.past.length}
        canRedo={!!h.future.length}
        busy={busy}
        error={error}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
