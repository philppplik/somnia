import { installBeforeUnload } from "../closeFlow";
import { useSyncExternalStore } from "react";
import {
  findMedia,
  getMedia,
  subscribeMedia,
  registerMediaCloseGuard,
} from "../media";
import type { PdfEditInfo, PdfEditOperation } from "./backend";
import type { PdfFieldInfo, PdfFieldValue } from "../pdfforms";
import {
  inspectPdfInWorker as inspectPdf,
  editPdfInWorker as applyPdfEdit,
  readFieldsInWorker as readFormFields,
  fillPdfInWorker,
} from "./workerClient";
export interface PdfSession {
  name: string;
  source: string;
  bytes: Uint8Array | null;
  page: number;
  info: PdfEditInfo | null;
  fields: PdfFieldInfo[];
  dirty: boolean;
  busy: boolean;
  editing: boolean;
  error: string | null;
  undo: Uint8Array[];
  redo: Uint8Array[];
  search: string;
  hits: { page: number; text: string }[];
  searching: boolean;
}
const sessions = new Map<string, PdfSession>(),
  listeners = new Set<() => void>();
let epoch = 0;
const emit = () => {
  epoch++;
  listeners.forEach((l) => l());
};
const set = (name: string, p: Partial<PdfSession>) => {
  const s = sessions.get(name);
  if (s) {
    sessions.set(name, { ...s, ...p });
    emit();
  }
};
export const subscribePdf = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function usePdfEpoch() {
  return useSyncExternalStore(
    subscribePdf,
    () => epoch,
    () => epoch,
  );
}
export function usePdfSession(name?: string | null) {
  useSyncExternalStore(
    subscribePdf,
    () => epoch,
    () => epoch,
  );
  const active = name ?? getMedia().active;
  return active ? (sessions.get(active) ?? null) : null;
}
export const getPdfSession = (name: string) => sessions.get(name);
export const hasDirtyPdfs = () => [...sessions.values()].some((s) => s.dirty);
if (typeof window !== "undefined") installBeforeUnload(hasDirtyPdfs);
export const pdfIsDirty = (name: string) => sessions.get(name)?.dirty ?? false;
registerMediaCloseGuard(
  (name) =>
    !pdfIsDirty(name) ||
    window.confirm(`Discard unsaved PDF edits to ${name}?`),
);
const bounded = (history: Uint8Array[]) => {
  let size = 0;
  return history
    .slice(-20)
    .reverse()
    .filter((b) => (size += b.byteLength) <= 100_000_000)
    .reverse();
};
subscribeMedia(() => {
  for (const [name, s] of sessions) {
    const m = findMedia(name);
    if (!m || m.url !== s.source) {
      sessions.delete(name);
      emit();
    }
  }
});
export async function openPdfSession(name: string) {
  const media = findMedia(name);
  if (!media || media.kind !== "pdf") return;
  if (sessions.get(name)?.source === media.url) return;
  const initial: PdfSession = {
    name,
    source: media.url,
    bytes: null,
    page: 1,
    info: null,
    fields: [],
    dirty: false,
    busy: true,
    editing: false,
    error: null,
    undo: [],
    redo: [],
    search: "",
    hits: [],
    searching: false,
  };
  sessions.set(name, initial);
  emit();
  try {
    const bytes = new Uint8Array(await (await fetch(media.url)).arrayBuffer());
    if (sessions.get(name) !== initial) return;
    let info: PdfEditInfo | null = null;
    let fields: PdfFieldInfo[] = [];
    try {
      info = await inspectPdf(bytes);
      if (!info.encrypted) fields = await readFormFields(bytes);
    } catch {
      /* pdf.js can display documents unsupported by pdf-lib; editing stays disabled. */
    }
    set(name, { bytes, info, fields, busy: false });
  } catch (e) {
    if (sessions.get(name) === initial)
      set(name, { busy: false, error: String(e) });
  }
}
export function selectPdfPage(name: string, page: number) {
  const s = sessions.get(name);
  if (!s) return;
  set(name, {
    page: Math.max(1, Math.min(s.info?.pages.length ?? 2000, page)),
  });
}
export function setPdfEditing(name: string) {
  const s = sessions.get(name);
  if (!s?.info || s.info.signed || s.info.encrypted || s.info.xfa) return;
  set(name, { editing: true, error: null });
}
export function pdfError(name: string, error: string | null) {
  set(name, { error });
}
async function commit(
  name: string,
  work: (s: PdfSession) => Promise<Uint8Array>,
) {
  const s = sessions.get(name);
  if (!s?.bytes || s.busy || !s.editing) return;
  set(name, { busy: true, error: null });
  try {
    const bytes = await work(s);
    const info = await inspectPdf(bytes);
    const fields = await readFormFields(bytes);
    if (sessions.get(name)?.source !== s.source) return;
    set(name, {
      bytes,
      info,
      fields,
      dirty: true,
      busy: false,
      page: Math.min(s.page, info.pages.length),
      undo: bounded([...s.undo, s.bytes]),
      redo: [],
      hits: [],
      search: "",
    });
  } catch (e) {
    set(name, {
      busy: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
export const editPdf = (name: string, op: PdfEditOperation) =>
  commit(name, (s) => applyPdfEdit(s.bytes!, op));
export const fillPdf = (name: string, values: Record<string, PdfFieldValue>) =>
  commit(name, async (s) => {
    if (s.info?.signed || s.info?.encrypted || s.info?.xfa)
      throw Error("This PDF is view-only.");
    return fillPdfInWorker(s.bytes!, values);
  });
export async function historyPdf(name: string, dir: "undo" | "redo") {
  const s = sessions.get(name);
  if (!s?.bytes || s.busy) return;
  const stack = s[dir];
  const bytes = stack.at(-1);
  if (!bytes) return;
  set(name, { busy: true, error: null });
  try {
    const info = await inspectPdf(bytes);
    const fields = await readFormFields(bytes);
    if (sessions.get(name)?.source !== s.source) return;
    set(name, {
      bytes,
      info,
      fields,
      busy: false,
      dirty: true,
      page: Math.min(s.page, info.pages.length),
      [dir]: stack.slice(0, -1),
      [dir === "undo" ? "redo" : "undo"]: bounded([
        ...s[dir === "undo" ? "redo" : "undo"],
        s.bytes,
      ]),
    });
  } catch (e) {
    set(name, { busy: false, error: String(e) });
  }
}
export async function exportPdfCopy(name: string) {
  const s = sessions.get(name);
  if (!s?.bytes || s.busy) return;
  const blob = new Blob([new Uint8Array(s.bytes)], { type: "application/pdf" });
  const { isTauri, invoke } = await import("@tauri-apps/api/core");
  const suggestedName =
    name.replace(/^.*[\\/]/, "").replace(/\.pdf$/i, "") + "-edited.pdf";
  if (isTauri()) {
    const grant = await invoke<{ token: string } | null>("pdf_save_pick", {
      suggestedName,
    });
    if (!grant) return;
    await invoke("pdf_save_write", new Uint8Array(s.bytes), {
      headers: { "x-somnia-token": grant.token },
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  if (sessions.get(name)?.bytes === s.bytes) set(name, { dirty: false });
}
export async function searchPdf(name: string, query: string) {
  const s = sessions.get(name);
  if (!s?.bytes) return;
  set(name, { search: query, searching: true, hits: [], error: null });
  let doc;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const { pdfjsBackend } = await import("../pdfview/pdfjsBrowser");
    doc = await pdfjsBackend.open(s.bytes.slice(), { signal: ac.signal });
    const hits = [];
    for (let n = 1; n <= Math.min(doc.pageCount, 2000); n++) {
      if (
        sessions.get(name)?.bytes !== s.bytes ||
        sessions.get(name)?.search !== query
      )
        return;
      const page = await doc.getPage(n);
      const text = (await page.getText?.()) ?? "";
      page.cleanup();
      if (
        query.trim() &&
        text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      )
        hits.push({
          page: n,
          text: text.slice(
            Math.max(
              0,
              text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 40,
            ),
            text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100,
          ),
        });
      if (hits.length >= 200) break;
    }
    if (
      sessions.get(name)?.search === query &&
      sessions.get(name)?.bytes === s.bytes
    )
      set(name, { hits, searching: false });
  } catch (e) {
    if (
      sessions.get(name)?.search === query &&
      sessions.get(name)?.bytes === s.bytes
    )
      set(name, { searching: false, error: String(e) });
  } finally {
    clearTimeout(timer);
    await doc?.destroy();
  }
}
