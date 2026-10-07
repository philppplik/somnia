import { fillForm } from './forms';
import {
  PDFFORMS_OP_TYPE, PDFFORMS_OP_VERSION,
  type JsonValue, type PdfFillOptions, type PdfFillResult, type PdfFormOperation, type PdfFieldValue,
} from './types';

export function newFillOperation(
  id: string,
  values: Readonly<Record<string, PdfFieldValue>> = {},
  opts: PdfFillOptions = {},
): PdfFormOperation {
  return {
    id, type: PDFFORMS_OP_TYPE, version: PDFFORMS_OP_VERSION, enabled: true,
    params: {
      values: toJsonValues(values),
      flatten: !!opts.flatten, overrideReadOnly: !!opts.overrideReadOnly, addMissingOptions: !!opts.addMissingOptions,
    },
  };
}

function toJsonValues(v: Readonly<Record<string, PdfFieldValue>>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [k, x] of Object.entries(v)) out[k] = Array.isArray(x) ? [...x] : (x as JsonValue);
  return out;
}

/** Atomic patch: merges new values over the old ones; null removes nothing (null clears the field). */
export function patchFillOperation(op: PdfFormOperation, values: Readonly<Record<string, PdfFieldValue>>): PdfFormOperation {
  return { ...op, params: { ...op.params, values: { ...op.params.values, ...toJsonValues(values) } } };
}

export function setFlatten(op: PdfFormOperation, flatten: boolean): PdfFormOperation {
  return { ...op, params: { ...op.params, flatten } };
}

/** Validate unknown JSON (e.g. loaded from disk). Returns null when it is not a usable fill operation. */
export function parseFillOperation(raw: unknown): PdfFormOperation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== PDFFORMS_OP_TYPE || typeof o.id !== 'string' || typeof o.version !== 'number' || o.version > PDFFORMS_OP_VERSION) return null;
  const p = o.params as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object' || !p.values || typeof p.values !== 'object' || Array.isArray(p.values)) return null;
  for (const v of Object.values(p.values as object)) {
    const ok = v === null || typeof v === 'string' || typeof v === 'boolean' || (Array.isArray(v) && v.every((s) => typeof s === 'string'));
    if (!ok) return null;
  }
  return {
    id: o.id, type: PDFFORMS_OP_TYPE, version: o.version, enabled: o.enabled !== false,
    params: {
      values: p.values as Record<string, JsonValue>,
      flatten: p.flatten === true, overrideReadOnly: p.overrideReadOnly === true, addMissingOptions: p.addMissingOptions === true,
    },
  };
}

/**
 * Replay operations in order. Disabled ops are skipped. Flatten stops later ops from finding
 * fields (they report not-found), so a flatten op should be last.
 */
export async function applyFillOperations(
  bytes: Uint8Array,
  ops: readonly PdfFormOperation[],
): Promise<PdfFillResult & { opResults: { id: string; applied: readonly string[]; errors: PdfFillResult['errors'] }[] }> {
  let cur = bytes;
  const applied: string[] = [];
  const errors: PdfFillResult['errors'][number][] = [];
  const opResults: { id: string; applied: readonly string[]; errors: PdfFillResult['errors'] }[] = [];
  let flattened = false;
  for (const op of ops) {
    if (!op.enabled || op.type !== PDFFORMS_OP_TYPE) continue;
    const r = await fillForm(cur, op.params.values as Record<string, PdfFieldValue>, op.params);
    cur = r.bytes; flattened = flattened || r.flattened;
    applied.push(...r.applied); errors.push(...r.errors);
    opResults.push({ id: op.id, applied: r.applied, errors: r.errors });
  }
  return { bytes: cur, applied, errors, flattened, opResults };
}
