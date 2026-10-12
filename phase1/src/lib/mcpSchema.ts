/**
 * Declarative, fail-closed JSON Schema interpreter for MCP tool arguments. Schemas come from
 * external servers, so both the schema and the arguments are untrusted. Nothing here evaluates
 * code; every walk is bounded (depth, node count, problem count, regex input size).
 *
 * Fail-closed rules:
 * - a schema that is not a plain object, or uses a keyword this interpreter does not know,
 *   is rejected (`unsupported-schema`) instead of being skipped;
 * - bounds that are exceeded (depth, node budget) reject the call (`limit`);
 * - `additionalProperties: false` is enforced; `$ref`, `if/then/else`, `not` and other
 *   keywords we cannot honor reject the call.
 * Annotation-only keywords (title, description, default, examples, format, ...) are ignored.
 * Supported: type, enum, const, required, properties, additionalProperties, items, minimum,
 * maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, minLength, maxLength, pattern,
 * minItems, maxItems, uniqueItems, minProperties, maxProperties, anyOf, oneOf, allOf.
 */
import { ERROR_IDS } from '../generated/errorIds';

export const MCP_ARG_ERROR_ID = ERROR_IDS.AGT_003;
export type McpArgIssueCode = 'type' | 'required' | 'enum' | 'const' | 'range' | 'length' | 'pattern' | 'items' | 'unique' | 'additional' | 'combinator' | 'unsupported-schema' | 'limit';
export interface McpArgIssue { code: McpArgIssueCode; path: string; message: string }
export type McpArgResult = { ok: true } | { ok: false; issues: McpArgIssue[] };
/** Typed failure: carries the registry error id and structured issues. Messages never echo argument values. */
export class McpArgsError extends Error {
  readonly errorId = MCP_ARG_ERROR_ID;
  constructor(readonly issues: readonly McpArgIssue[]) {
    super(`Invalid arguments for this tool: ${issues.map(i => i.message).join('; ')}.`);
    this.name = 'McpArgsError';
  }
}

const MAX_DEPTH = 8;
const MAX_PROBLEMS = 8;
const MAX_NODES = 5000;
const MAX_ITEMS_WALKED = 200;
const MAX_PATTERN = 256;
const MAX_PATTERN_INPUT = 4096;
const ANNOTATIONS = new Set(['$schema', '$id', '$comment', '$defs', 'definitions', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'format', 'contentMediaType', 'contentEncoding']);
const KNOWN = new Set(['type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'anyOf', 'oneOf', 'allOf']);
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

type Schema = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
const matchesType = (v: unknown, t: string) => { const a = typeOf(v); return a === t || (t === 'number' && a === 'integer'); };
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

interface Ctx { out: McpArgIssue[]; nodes: number; stop: boolean }
function push(c: Ctx, code: McpArgIssueCode, path: string, message: string) {
  if (c.out.length < MAX_PROBLEMS) c.out.push({ code, path, message });
  if (code === 'unsupported-schema' || code === 'limit') c.stop = true;
}
const join = (p: string, k: string) => (p ? `${p}.${k}` : k);

function walk(value: unknown, schema: unknown, path: string, depth: number, c: Ctx): void {
  if (c.stop || c.out.length >= MAX_PROBLEMS) return;
  const at = path || 'arguments';
  if (depth > MAX_DEPTH) return push(c, 'limit', at, `${at} is nested too deeply`);
  if (++c.nodes > MAX_NODES) return push(c, 'limit', at, 'arguments are too complex to check');
  if (schema === true) return;
  if (schema === false) return push(c, 'type', at, `${at} is not allowed`);
  if (!isObj(schema)) return push(c, 'unsupported-schema', at, `the tool schema at ${at} is malformed`);
  const s = schema as Schema;
  for (const k of Object.keys(s)) if (!KNOWN.has(k) && !ANNOTATIONS.has(k)) return push(c, 'unsupported-schema', at, `the tool schema uses unsupported keyword "${k.slice(0, 40)}"`);

  if (has(s, 'type')) {
    const t = s.type;
    const types = typeof t === 'string' ? [t] : Array.isArray(t) ? t : null;
    if (!types || !types.length || !types.every(x => typeof x === 'string' && TYPES.has(x))) return push(c, 'unsupported-schema', at, `the tool schema type at ${at} is malformed`);
    if (!(types as string[]).some(x => matchesType(value, x))) return push(c, 'type', at, `${at} must be ${(types as string[]).join(' or ')}`);
  }
  if (has(s, 'enum')) {
    if (!Array.isArray(s.enum)) return push(c, 'unsupported-schema', at, `the tool schema enum at ${at} is malformed`);
    const sv = stable(value);
    if (!s.enum.some(e => stable(e) === sv)) push(c, 'enum', at, `${at} must be one of the allowed values`);
  }
  if (has(s, 'const') && stable(s.const) !== stable(value)) push(c, 'const', at, `${at} must equal the fixed value`);

  if (typeof value === 'number') {
    const nums: [string, unknown][] = [['minimum', s.minimum], ['maximum', s.maximum], ['exclusiveMinimum', s.exclusiveMinimum], ['exclusiveMaximum', s.exclusiveMaximum], ['multipleOf', s.multipleOf]];
    for (const [k, v] of nums) if (has(s, k) && !num(v)) return push(c, 'unsupported-schema', at, `the tool schema ${k} at ${at} is malformed`);
    if (num(s.minimum) && value < s.minimum) push(c, 'range', at, `${at} must be at least ${s.minimum}`);
    if (num(s.maximum) && value > s.maximum) push(c, 'range', at, `${at} must be at most ${s.maximum}`);
    if (num(s.exclusiveMinimum) && value <= s.exclusiveMinimum) push(c, 'range', at, `${at} must be greater than ${s.exclusiveMinimum}`);
    if (num(s.exclusiveMaximum) && value >= s.exclusiveMaximum) push(c, 'range', at, `${at} must be less than ${s.exclusiveMaximum}`);
    if (num(s.multipleOf)) {
      if (s.multipleOf <= 0) return push(c, 'unsupported-schema', at, `the tool schema multipleOf at ${at} is malformed`);
      const q = value / s.multipleOf;
      if (Math.abs(q - Math.round(q)) > 1e-9) push(c, 'range', at, `${at} must be a multiple of ${s.multipleOf}`);
    }
  }
  if (typeof value === 'string') {
    for (const k of ['minLength', 'maxLength']) if (has(s, k) && !nonNegInt(s[k])) return push(c, 'unsupported-schema', at, `the tool schema ${k} at ${at} is malformed`);
    const len = [...value].length;
    if (nonNegInt(s.minLength) && len < s.minLength) push(c, 'length', at, `${at} is too short`);
    if (nonNegInt(s.maxLength) && len > s.maxLength) push(c, 'length', at, `${at} is too long`);
    if (has(s, 'pattern')) {
      if (typeof s.pattern !== 'string' || s.pattern.length > MAX_PATTERN) return push(c, 'unsupported-schema', at, `the tool schema pattern at ${at} is not supported`);
      if (value.length > MAX_PATTERN_INPUT) return push(c, 'limit', at, `${at} is too long to check`);
      let re: RegExp;
      try { re = new RegExp(s.pattern, 'u'); } catch { return push(c, 'unsupported-schema', at, `the tool schema pattern at ${at} is invalid`); }
      if (!re.test(value)) push(c, 'pattern', at, `${at} has the wrong format`);
    }
  }
  if (Array.isArray(value)) {
    for (const k of ['minItems', 'maxItems']) if (has(s, k) && !nonNegInt(s[k])) return push(c, 'unsupported-schema', at, `the tool schema ${k} at ${at} is malformed`);
    if (nonNegInt(s.minItems) && value.length < s.minItems) push(c, 'items', at, `${at} needs at least ${s.minItems} items`);
    if (nonNegInt(s.maxItems) && value.length > s.maxItems) push(c, 'items', at, `${at} allows at most ${s.maxItems} items`);
    if (s.uniqueItems === true) {
      if (value.length > MAX_ITEMS_WALKED) return push(c, 'limit', at, `${at} is too long to check`);
      const seen = new Set<string>();
      for (const v of value) { const k = stable(v); if (seen.has(k)) { push(c, 'unique', at, `${at} must not repeat items`); break; } seen.add(k); }
    }
    if (has(s, 'items')) {
      if (!isObj(s.items) && typeof s.items !== 'boolean') return push(c, 'unsupported-schema', at, `the tool schema items at ${at} is malformed`);
      if (value.length > MAX_ITEMS_WALKED) return push(c, 'limit', at, `${at} is too long to check`);
      value.forEach((item, i) => walk(item, s.items, `${path}[${i}]`, depth + 1, c));
    }
  }
  if (isObj(value)) {
    const keys = Object.keys(value);
    for (const k of ['minProperties', 'maxProperties']) if (has(s, k) && !nonNegInt(s[k])) return push(c, 'unsupported-schema', at, `the tool schema ${k} at ${at} is malformed`);
    if (nonNegInt(s.minProperties) && keys.length < s.minProperties) push(c, 'items', at, `${at} needs at least ${s.minProperties} properties`);
    if (nonNegInt(s.maxProperties) && keys.length > s.maxProperties) push(c, 'items', at, `${at} allows at most ${s.maxProperties} properties`);
    if (has(s, 'required')) {
      if (!Array.isArray(s.required) || !s.required.every(k => typeof k === 'string')) return push(c, 'unsupported-schema', at, `the tool schema required list at ${at} is malformed`);
      for (const k of s.required as string[]) if (!has(value, k)) push(c, 'required', join(path, k), `${join(path, k)} is required`);
    }
    if (has(s, 'properties') && !isObj(s.properties)) return push(c, 'unsupported-schema', at, `the tool schema properties at ${at} is malformed`);
    const props = isObj(s.properties) ? s.properties : {};
    if (has(s, 'additionalProperties') && typeof s.additionalProperties !== 'boolean' && !isObj(s.additionalProperties)) return push(c, 'unsupported-schema', at, `the tool schema additionalProperties at ${at} is malformed`);
    for (const k of keys) {
      if (has(props, k)) walk(value[k], props[k], join(path, k), depth + 1, c);
      else if (s.additionalProperties === false) push(c, 'additional', join(path, k), `${join(path, k).slice(0, 80)} is not an allowed argument`);
      else if (isObj(s.additionalProperties)) walk(value[k], s.additionalProperties, join(path, k), depth + 1, c);
    }
  }
  for (const k of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (!has(s, k)) continue;
    const list = s[k];
    if (!Array.isArray(list) || !list.length || list.length > 16) return push(c, 'unsupported-schema', at, `the tool schema ${k} at ${at} is malformed`);
    if (k === 'allOf') { for (const sub of list) walk(value, sub, path, depth + 1, c); continue; }
    let passes = 0;
    for (const sub of list) {
      const inner: Ctx = { out: [], nodes: c.nodes, stop: false };
      walk(value, sub, path, depth + 1, inner);
      c.nodes = inner.nodes;
      if (inner.stop) { for (const i of inner.out) push(c, i.code, i.path, i.message); return; }
      if (!inner.out.length) passes++;
    }
    if (k === 'anyOf' && passes < 1) push(c, 'combinator', at, `${at} does not match any allowed shape`);
    if (k === 'oneOf' && passes !== 1) push(c, 'combinator', at, `${at} must match exactly one allowed shape`);
  }
}

/**
 * Validates arguments against a server-published schema. An absent schema means "any object";
 * any other non-object schema is rejected. Never throws.
 */
export function checkMcpArgs(args: unknown, schema: unknown): McpArgResult {
  const c: Ctx = { out: [], nodes: 0, stop: false };
  try {
    const effective = schema === undefined || schema === null ? { type: 'object' } : schema;
    if (!isObj(args)) push(c, 'type', 'arguments', 'arguments must be object');
    else walk(args, effective, '', 0, c);
  } catch {
    return { ok: false, issues: [{ code: 'limit', path: 'arguments', message: 'arguments could not be checked' }] };
  }
  return c.out.length ? { ok: false, issues: c.out.slice(0, MAX_PROBLEMS) } : { ok: true };
}
/** Throws McpArgsError when invalid. */
export function assertMcpArgs(args: unknown, schema: unknown): void {
  const r = checkMcpArgs(args, schema);
  if (!r.ok) throw new McpArgsError(r.issues);
}
/** Back-compat: human readable problems (empty = valid). Fail-closed like checkMcpArgs. */
export function validateMcpArgs(args: unknown, schema: unknown): string[] {
  const r = checkMcpArgs(args, schema);
  return r.ok ? [] : r.issues.map(i => i.message);
}
