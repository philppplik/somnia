/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;
import { applyPdfEdit, inspectPdf, type PdfEditOperation } from "./backend";
import { readFormFields, fillForm, type PdfFieldValue } from "../pdfforms";
type Request = {
  id: number;
  bytes: Uint8Array;
  kind: "inspect" | "edit" | "fields" | "fill";
  operation?: PdfEditOperation;
  values?: Record<string, PdfFieldValue>;
};
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    let result: unknown;
    if (data.kind === "inspect") result = await inspectPdf(data.bytes);
    else if (data.kind === "fields") result = await readFormFields(data.bytes);
    else if (data.kind === "edit") {
      if (!data.operation) throw Error("Missing edit operation.");
      result = await applyPdfEdit(data.bytes, data.operation);
    } else {
      const info = await inspectPdf(data.bytes);
      if (info.signed || info.encrypted) throw Error("This PDF is view-only.");
      const filled = await fillForm(data.bytes, data.values ?? {});
      if (filled.errors.length)
        throw Error(filled.errors.map((e) => e.message).join(" "));
      result = filled.bytes;
    }
    self.postMessage(
      { id: data.id, result },
      result instanceof Uint8Array ? [result.buffer as ArrayBuffer] : [],
    );
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
