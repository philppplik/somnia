import { useEffect } from "react";
import type { MediaItem } from "../../lib/media";
import { PdfAnnotationOverlay } from "./PdfAnnotationOverlay";
import { PdfFieldOverlay } from "./PdfFieldOverlay";
import { PdfViewer } from "./PdfViewer";
import {
  editPdf,
  exportPdfCopy,
  historyPdf,
  openPdfSession,
  pdfError,
  selectPdfPage,
  setPdfEditing,
  usePdfSession,
} from "../../lib/pdfedit/session";
import { registerCommand } from "../../lib/commands";
import { installBeforeUnload } from "../../lib/closeFlow";
import { hasDirtyPdfs } from "../../lib/pdfedit/session";
export const pdfButton =
  "cursor-pointer rounded-sm border-0 bg-transparent px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40 disabled:cursor-default";
export function PdfInlineEditor({ item }: { item: MediaItem }) {
  const s = usePdfSession(item.name);
  useEffect(() => {
    void openPdfSession(item.name);
  }, [item.name, item.url]);
  useEffect(() => installBeforeUnload(hasDirtyPdfs), []);
  useEffect(() => {
    const name = item.name;
    const action = (f: () => Promise<unknown>) =>
      void f().catch((e) => pdfError(name, String(e)));
    const off = [
      registerCommand({
        id: "pdf.saveCopy",
        title: "PDF: Save edited copy",
        category: "Project",
        shortcut: "Mod+Shift+S",
        run: () => exportPdfCopy(name),
      }),
      registerCommand({
        id: "pdf.page.rotate",
        title: "PDF: Rotate page clockwise",
        category: "Tools",
        enabled: () => !!s?.editing && !s.busy,
        run: () => editPdf(name, { kind: "rotate", page: (s?.page ?? 1) - 1 }),
      }),
      registerCommand({
        id: "pdf.undo",
        title: "PDF: Undo",
        category: "Edit",
        enabled: () => !!s?.undo.length && !s.busy,
        run: () => historyPdf(name, "undo"),
      }),
      registerCommand({
        id: "pdf.redo",
        title: "PDF: Redo",
        category: "Edit",
        enabled: () => !!s?.redo.length && !s.busy,
        run: () => historyPdf(name, "redo"),
      }),
    ];
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const input =
        e.target instanceof HTMLElement &&
        (e.target.matches("input,textarea") || e.target.isContentEditable);
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        action(() => exportPdfCopy(name));
      } else if (e.key.toLowerCase() === "z" && !input) {
        e.preventDefault();
        e.stopImmediatePropagation();
        action(() => historyPdf(name, e.shiftKey ? "redo" : "undo"));
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      off.forEach((f) => f());
      window.removeEventListener("keydown", key, true);
    };
  }, [item.name, s]);
  if (!s?.bytes)
    return (
      <div role="status" className="grid flex-1 place-items-center text-sm">
        {s?.error ?? "Opening PDF…"}
      </div>
    );
  const viewOnly = !s.info || s.info.encrypted || s.info.signed || s.info.xfa;
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Inline PDF editor"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-subtle px-3 py-1">
        <button
          className={pdfButton}
          aria-pressed={s.editing}
          disabled={viewOnly || s.editing || s.busy}
          onClick={() => setPdfEditing(item.name)}
        >
          Edit PDF
        </button>
        <span className="text-xs text-ink-3">
          {s.info?.xfa
            ? "XFA · view only"
            : s.info?.signed
              ? "Signed · view only"
              : s.info?.encrypted
                ? "Encrypted · view only"
                : !s.info
                  ? "View only"
                  : s.editing
                    ? "Editing a copy"
                    : "Read only"}
        </span>
        <span className="flex-1" />
        <button
          className={pdfButton}
          aria-label="Undo PDF edit"
          disabled={!s.undo.length || s.busy}
          onClick={() => void historyPdf(item.name, "undo")}
        >
          Undo
        </button>
        <button
          className={pdfButton}
          aria-label="Redo PDF edit"
          disabled={!s.redo.length || s.busy}
          onClick={() => void historyPdf(item.name, "redo")}
        >
          Redo
        </button>
        <button
          className={pdfButton}
          disabled={s.busy}
          onClick={() =>
            void exportPdfCopy(item.name).catch((e) =>
              pdfError(item.name, String(e)),
            )
          }
        >
          Save copy{s.dirty ? " *" : ""}
        </button>
      </div>
      {s.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-subtle p-2 text-xs text-red-600"
        >
          {s.error}
          <button
            className={pdfButton}
            onClick={() => pdfError(item.name, null)}
          >
            Dismiss
          </button>
        </div>
      )}
      <PdfViewer
        data={s.bytes}
        name={item.name}
        textLayer
        renderOverlay={(geometry) => (
          <>
            <PdfFieldOverlay
              key={`${item.name}:${geometry.page}`}
              name={item.name}
              geometry={geometry}
            />
            <PdfAnnotationOverlay
              key={`annot:${item.name}:${geometry.page}`}
              name={item.name}
              geometry={geometry}
            />
          </>
        )}
        requestedPage={s.page}
        onPageChange={(n) => {
          if (s.page !== n) selectPdfPage(item.name, n);
        }}
      />
      <footer className="flex shrink-0 items-center gap-3 border-t border-subtle px-3 py-1 text-[11px] text-ink-3">
        <span>
          {s.busy ? "Applying edit…" : `${s.info?.pages.length ?? ""} pages`}
        </span>
        <span className="flex-1" />
        <span>Save copy rewrites the PDF. No automatic overwrite.</span>
      </footer>
    </section>
  );
}
