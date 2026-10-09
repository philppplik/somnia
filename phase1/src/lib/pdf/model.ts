/** Metadata-only PDF edits. Coordinates are unrotated PDF points, bottom-left origin. */
export const PDF_EDIT_SCHEMA = "somnia.pdf-edit/1" as const;
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfEditPage {
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
}
export interface PdfEditAnnotation {
  id: string;
  sourcePage: number;
  kind: "highlight" | "strikethrough" | "freeText";
  rect: PdfRect;
  text: string;
  color: [number, number, number];
  opacity: number;
  fontSize: number;
}
export interface PdfEditDocument {
  schema: typeof PDF_EDIT_SCHEMA;
  sourcePageCount: number;
  pages: PdfEditPage[];
  annotations: PdfEditAnnotation[];
  fieldValues: Record<string, string | boolean | string[] | null>;
}
export type PdfEditCommand =
  | { kind: "rotate"; sourcePage: number; clockwise?: boolean }
  | { kind: "delete"; sourcePage: number }
  | { kind: "reorder"; sourcePages: number[] }
  | { kind: "annotation.add"; annotation: PdfEditAnnotation }
  | { kind: "annotation.remove"; id: string }
  | {
      kind: "field.set";
      name: string;
      value: string | boolean | string[] | null;
    }
  | { kind: "field.reset"; name: string };
export class PdfEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfEditError";
  }
}
const fail = (message: string): never => {
  throw new PdfEditError(message);
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const pageIndex = (n: unknown, count: number): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < count;
export function createPdfEditDocument(pageCount: number): PdfEditDocument {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 2000)
    fail("Page count must be 1-2000.");
  return {
    schema: PDF_EDIT_SCHEMA,
    sourcePageCount: pageCount,
    pages: Array.from({ length: pageCount }, (_, sourcePage) => ({
      sourcePage,
      rotation: 0,
    })),
    annotations: [],
    fieldValues: {},
  };
}
/** Strict persistence boundary. Reject unknown schema, invalid geometry and malformed values. */
export function validatePdfEditDocument(
  value: unknown,
): asserts value is PdfEditDocument {
  if (!value || typeof value !== "object") fail("Invalid PDF edit metadata.");
  const d = value as PdfEditDocument;
  if (
    d.schema !== PDF_EDIT_SCHEMA ||
    !Number.isInteger(d.sourcePageCount) ||
    d.sourcePageCount < 1 ||
    d.sourcePageCount > 2000
  )
    fail("Unsupported PDF edit metadata.");
  if (
    !Array.isArray(d.pages) ||
    !d.pages.length ||
    d.pages.length > d.sourcePageCount
  )
    fail("Keep at least one page.");
  const pages = new Set<number>();
  for (const p of d.pages) {
    if (
      !p ||
      !pageIndex(p.sourcePage, d.sourcePageCount) ||
      pages.has(p.sourcePage) ||
      ![0, 90, 180, 270].includes(p.rotation)
    )
      fail("Invalid page mapping.");
    pages.add(p.sourcePage);
  }
  if (!Array.isArray(d.annotations) || d.annotations.length > 10000)
    fail("Invalid annotations.");
  const ids = new Set<string>();
  for (const a of d.annotations) {
    if (
      !a ||
      typeof a.id !== "string" ||
      !a.id ||
      a.id.length > 200 ||
      ids.has(a.id) ||
      !pageIndex(a.sourcePage, d.sourcePageCount)
    )
      fail("Invalid annotation identity.");
    ids.add(a.id);
    if (!["highlight", "strikethrough", "freeText"].includes(a.kind))
      fail("Unknown annotation kind.");
    const r = a.rect;
    if (
      !r ||
      ![r.x, r.y, r.width, r.height].every(finite) ||
      r.width < 2 ||
      r.height < 2
    )
      fail("Invalid annotation rectangle.");
    if (
      typeof a.text !== "string" ||
      a.text.length > 20000 ||
      (a.kind === "freeText" && !a.text.trim())
    )
      fail("Invalid annotation text.");
    if (
      !Array.isArray(a.color) ||
      a.color.length !== 3 ||
      !a.color.every((n) => finite(n) && n >= 0 && n <= 1) ||
      !finite(a.opacity) ||
      a.opacity < 0.05 ||
      a.opacity > 1 ||
      !finite(a.fontSize) ||
      a.fontSize < 1 ||
      a.fontSize > 300
    )
      fail("Invalid annotation style.");
  }
  if (
    !d.fieldValues ||
    typeof d.fieldValues !== "object" ||
    Array.isArray(d.fieldValues) ||
    Object.keys(d.fieldValues).length > 10000
  )
    fail("Invalid form values.");
  for (const [name, v] of Object.entries(d.fieldValues)) {
    if (
      !name ||
      name.length > 1000 ||
      !(
        v === null ||
        typeof v === "boolean" ||
        (typeof v === "string" && v.length <= 20000) ||
        (Array.isArray(v) &&
          v.length <= 1000 &&
          v.every((s) => typeof s === "string" && s.length <= 20000))
      )
    )
      fail("Invalid form value.");
  }
}
const clone = (d: PdfEditDocument): PdfEditDocument =>
  JSON.parse(JSON.stringify(d));
export function applyPdfEditCommand(
  document: PdfEditDocument,
  command: PdfEditCommand,
): PdfEditDocument {
  validatePdfEditDocument(document);
  const next = clone(document);
  switch (command.kind) {
    case "rotate": {
      const page = next.pages.find((p) => p.sourcePage === command.sourcePage);
      if (!page) throw new PdfEditError("Page does not exist.");
      page.rotation = ((page.rotation +
        (command.clockwise === false ? 270 : 90)) %
        360) as PdfEditPage["rotation"];
      break;
    }
    case "delete":
      if (!next.pages.some((p) => p.sourcePage === command.sourcePage))
        fail("Page does not exist.");
      if (next.pages.length === 1) fail("Keep at least one page.");
      next.pages = next.pages.filter(
        (p) => p.sourcePage !== command.sourcePage,
      );
      break;
    case "reorder": {
      if (
        command.sourcePages.length !== next.pages.length ||
        new Set(command.sourcePages).size !== next.pages.length ||
        command.sourcePages.some(
          (p) => !next.pages.some((n) => n.sourcePage === p),
        )
      )
        fail("Reorder must be a permutation of the current pages.");
      next.pages = command.sourcePages.map((n) =>
        next.pages.find((p) => p.sourcePage === n)!,
      );
      break;
    }
    case "annotation.add":
      if (
        !next.pages.some((p) => p.sourcePage === command.annotation.sourcePage)
      )
        fail("Page does not exist.");
      next.annotations.push(JSON.parse(JSON.stringify(command.annotation)));
      break;
    case "annotation.remove":
      if (!next.annotations.some((a) => a.id === command.id))
        fail("Annotation does not exist.");
      next.annotations = next.annotations.filter((a) => a.id !== command.id);
      break;
    case "field.set":
      Object.defineProperty(next.fieldValues, command.name, {
        value: command.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      break;
    case "field.reset":
      delete next.fieldValues[command.name];
      break;
    default:
      fail("Unknown PDF edit command.");
  }
  validatePdfEditDocument(next);
  return clone(next);
}
/** Extraction is a new metadata document. The input and its page order remain unchanged. */
export function extractPdfPages(
  document: PdfEditDocument,
  sourcePages: readonly number[],
): PdfEditDocument {
  validatePdfEditDocument(document);
  if (
    !sourcePages.length ||
    new Set(sourcePages).size !== sourcePages.length ||
    sourcePages.some((p) => !document.pages.some((n) => n.sourcePage === p))
  )
    fail("Choose existing, unique pages to extract.");
  const next = clone(document);
  next.pages = sourcePages.map((p) =>
    next.pages.find((n) => n.sourcePage === p)!,
  );
  next.annotations = next.annotations.filter((a) =>
    sourcePages.includes(a.sourcePage),
  );
  return next;
}
export function serializePdfEdits(d: PdfEditDocument): string {
  validatePdfEditDocument(d);
  return JSON.stringify(d);
}
export function parsePdfEdits(text: string): PdfEditDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("Invalid JSON.");
  }
  validatePdfEditDocument(value);
  return clone(value);
}
export interface PdfEditHistory {
  present: PdfEditDocument;
  past: PdfEditDocument[];
  future: PdfEditDocument[];
}
export function commitPdfEdits(
  h: PdfEditHistory,
  command: PdfEditCommand,
): PdfEditHistory {
  return {
    present: applyPdfEditCommand(h.present, command),
    past: [...h.past.slice(-49), clone(h.present)],
    future: [],
  };
}
export function undoPdfEdits(h: PdfEditHistory): PdfEditHistory {
  if (!h.past.length) return h;
  return {
    present: clone(h.past[h.past.length - 1]),
    past: h.past.slice(0, -1),
    future: [clone(h.present), ...h.future],
  };
}
export function redoPdfEdits(h: PdfEditHistory): PdfEditHistory {
  if (!h.future.length) return h;
  return {
    present: clone(h.future[0]),
    past: [...h.past, clone(h.present)],
    future: h.future.slice(1),
  };
}
