import type { PdfEditInfo, PdfEditOperation } from "./backend";
import type { PdfFieldInfo, PdfFieldValue } from "../pdfforms";
/** Each bounded job gets its own worker. A pathological parser cannot freeze the app or queue every document forever. */
function run<T>(
  bytes: Uint8Array,
  kind: "inspect" | "edit" | "fields" | "fill",
  extra: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const finish = (error?: Error, result?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(result as T);
    };
    const timer = setTimeout(
      () =>
        finish(
          Error("PDF processing exceeded 20 seconds. No edit was applied."),
        ),
      20_000,
    );
    worker.onerror = (e) =>
      finish(Error(e.message || "PDF processing worker failed."));
    worker.onmessage = ({ data }) =>
      data.error ? finish(Error(data.error)) : finish(undefined, data.result);
    worker.postMessage({ id: 1, kind, bytes: bytes.slice(), ...extra });
  });
}
export const inspectPdfInWorker = (bytes: Uint8Array) =>
  run<PdfEditInfo>(bytes, "inspect");
export const readFieldsInWorker = (bytes: Uint8Array) =>
  run<PdfFieldInfo[]>(bytes, "fields");
export const editPdfInWorker = (
  bytes: Uint8Array,
  operation: PdfEditOperation,
) => run<Uint8Array>(bytes, "edit", { operation });
export const fillPdfInWorker = (
  bytes: Uint8Array,
  values: Record<string, PdfFieldValue>,
) => run<Uint8Array>(bytes, "fill", { values });
