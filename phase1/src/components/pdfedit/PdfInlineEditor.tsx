import { useEffect } from "react";
import type { MediaItem } from "../../lib/media";
import { PdfMarkupOverlay } from "./PdfMarkupOverlay";
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
import { registerCommandSpec } from "../../lib/commandBridge";
import { pdfCommandSpecs } from "../../lib/pdfedit/commands";
import { installBeforeUnload } from "../../lib/closeFlow";
import { setPdfExportAdvanced } from "../../lib/pdfedit/exportAdvancedState";
import { PdfExportAdvanced } from "./PdfExportAdvanced";
import { hasDirtyPdfs } from "../../lib/pdfedit/session";
import {NativeButton} from '../ui/native-controls';
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
    const off = pdfCommandSpecs({
      name,
      getSession: () => s,
      exportCopy: exportPdfCopy,
      openAdvanced: (n) => setPdfExportAdvanced(n),
      rotate: (n, page) => editPdf(n, { kind: "rotate", page }),
      history: historyPdf,
    }).map((spec) => registerCommandSpec(spec));
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
        <NativeButton
          className={pdfButton}
          aria-pressed={s.editing}
          disabled={viewOnly || s.editing || s.busy}
          onClick={() => setPdfEditing(item.name)}
        >
          Edit PDF
        </NativeButton>
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
        <NativeButton
          className={pdfButton}
          aria-label="Undo PDF edit"
          disabled={!s.undo.length || s.busy}
          onClick={() => void historyPdf(item.name, "undo")}
        >
          Undo
        </NativeButton>
        <NativeButton
          className={pdfButton}
          aria-label="Redo PDF edit"
          disabled={!s.redo.length || s.busy}
          onClick={() => void historyPdf(item.name, "redo")}
        >
          Redo
        </NativeButton>
        <NativeButton
          className={pdfButton}
          disabled={s.busy}
          onClick={() =>
            void exportPdfCopy(item.name).catch((e) =>
              pdfError(item.name, String(e)),
            )
          }
        >
          Save copy{s.dirty ? " *" : ""}
        </NativeButton>
      </div>
      <PdfExportAdvanced name={item.name} />
      {s.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-subtle p-2 text-xs text-red-600"
        >
          {s.error}
          <NativeButton
            className={pdfButton}
            onClick={() => pdfError(item.name, null)}
          >
            Dismiss
          </NativeButton>
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
            <PdfMarkupOverlay
              key={`markup:${item.name}:${geometry.page}`}
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
