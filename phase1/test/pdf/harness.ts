/**
 * Conformance harness. The PDF modules are built in parallel and integrated by the
 * central builder, so these tests only run when SOMNIA_PDFLIB points at them.
 *
 *   SOMNIA_PDFLIB=/abs/path/to/phase1/src/lib/pdf npx tsx --test test/pdf/*.test.ts
 *
 * The directory must contain pdftext, pdfannotate, pdforganize and pdfforms
 * (as .ts or .js; each may also be a folder with index.ts). Unset: every
 * conformance test is reported as SKIP, never as a failure.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type PdfModuleName = 'pdftext' | 'pdfannotate' | 'pdforganize' | 'pdfforms';

export const PDFLIB_DIR: string | undefined = process.env.SOMNIA_PDFLIB?.trim() || undefined;
export const SKIP_REASON = 'SOMNIA_PDFLIB not set (PDF modules not wired in)';

/** Proposed handler shape, see docs/pdf-editor/architecture.md. Tests assert only this much. */
export interface PdfOperation {
  readonly id: string;
  readonly type: string; // "pdf-<area>-<verb>"
  readonly version: number;
  readonly params: Readonly<Record<string, unknown>>;
}
export interface PdfOpHandler {
  readonly type: string;
  readonly version: number;
  apply(input: Uint8Array, params: PdfOperation['params'], context: { signal?: AbortSignal }): Uint8Array | Promise<Uint8Array>;
}
export interface PdfOpRegistry {
  register(handler: PdfOpHandler): () => void;
}

/** Minimal registry for tests: same register/dispose semantics as the image OperationRegistry. */
export class TestRegistry implements PdfOpRegistry {
  readonly handlers = new Map<string, PdfOpHandler>();
  register(handler: PdfOpHandler): () => void {
    const key = `${handler.type}@${handler.version}`;
    if (this.handlers.has(key)) throw new Error(`PDF handler already registered: ${key}`);
    this.handlers.set(key, handler);
    return () => { if (this.handlers.get(key) === handler) this.handlers.delete(key); };
  }
  find(type: string, version = 1): PdfOpHandler | undefined {
    return this.handlers.get(`${type}@${version}`);
  }
}

function resolveModuleFile(dir: string, name: string): string | undefined {
  for (const rel of [`${name}.ts`, `${name}.js`, `${name}.mjs`, `${name}/index.ts`, `${name}/index.js`]) {
    const p = path.join(dir, rel);
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function loadPdfModule(name: PdfModuleName): Promise<Record<string, unknown>> {
  if (!PDFLIB_DIR) throw new Error(SKIP_REASON);
  const file = resolveModuleFile(path.resolve(PDFLIB_DIR), name);
  if (!file) throw new Error(`SOMNIA_PDFLIB=${PDFLIB_DIR} has no module "${name}"`);
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
}

/** Convention: every module exports exactly one `registerPdf<Area>Ops(registry)` returning a disposer. */
export const REGISTER_EXPORT: Record<PdfModuleName, string> = {
  pdftext: 'registerPdfTextOps',
  pdfannotate: 'registerPdfAnnotateOps',
  pdforganize: 'registerPdfOrganizeOps',
  pdfforms: 'registerPdfFormsOps',
};

export async function registerModule(name: PdfModuleName): Promise<{ registry: TestRegistry; dispose: () => void }> {
  const mod = await loadPdfModule(name);
  const fn = mod[REGISTER_EXPORT[name]];
  if (typeof fn !== 'function') throw new Error(`${name} must export ${REGISTER_EXPORT[name]}(registry)`);
  const registry = new TestRegistry();
  const dispose = (fn as (r: PdfOpRegistry) => () => void)(registry);
  if (typeof dispose !== 'function') throw new Error(`${REGISTER_EXPORT[name]} must return a disposer`);
  return { registry, dispose };
}

/** Shared contract checks every module must pass, regardless of area. */
export const OP_TYPE_PATTERN = /^pdf-[a-z]+-[a-z][a-z0-9-]*$/;

export function areaPrefix(name: PdfModuleName): string {
  return { pdftext: 'pdf-text-', pdfannotate: 'pdf-annot-', pdforganize: 'pdf-page-', pdfforms: 'pdf-form-' }[name];
}
