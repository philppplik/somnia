/**
 * Minimal JSON Schema check for MCP tool arguments. External servers publish the schema, so it is
 * untrusted too: this validator only reads a small, bounded subset and never evaluates anything.
 * Unknown keywords are ignored; the server stays the final authority on its own input.
 * Supported: type, required, properties, items, enum, const, minimum, maximum, minLength,
 * maxLength, minItems, maxItems. Returns human readable problems (empty = valid).
 */
const MAX_DEPTH = 8;
const MAX_PROBLEMS = 8;
type Schema = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}
function walk(value: unknown, schema: unknown, path: string, depth: number, out: string[]): void {
  if (out.length >= MAX_PROBLEMS || depth > MAX_DEPTH || !isObj(schema)) return;
  const s = schema as Schema;
  const at = path || 'arguments';
  const types = typeof s.type === 'string' ? [s.type] : Array.isArray(s.type) ? s.type.filter((x): x is string => typeof x === 'string') : [];
  if (types.length && !types.some(t => matchesType(value, t))) { out.push(`${at} must be ${types.join(' or ')}`); return; }
  if (Array.isArray(s.enum) && !s.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) out.push(`${at} must be one of the allowed values`);
  if ('const' in s && JSON.stringify(s.const) !== JSON.stringify(value)) out.push(`${at} must equal the fixed value`);
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) out.push(`${at} must be at least ${s.minimum}`);
    if (typeof s.maximum === 'number' && value > s.maximum) out.push(`${at} must be at most ${s.maximum}`);
  }
  if (typeof value === 'string') {
    if (typeof s.minLength === 'number' && value.length < s.minLength) out.push(`${at} is too short`);
    if (typeof s.maxLength === 'number' && value.length > s.maxLength) out.push(`${at} is too long`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) out.push(`${at} needs at least ${s.minItems} items`);
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) out.push(`${at} allows at most ${s.maxItems} items`);
    if (isObj(s.items)) value.slice(0, 200).forEach((item, i) => walk(item, s.items, `${path}[${i}]`, depth + 1, out));
  }
  if (isObj(value)) {
    if (Array.isArray(s.required)) for (const k of s.required) if (typeof k === 'string' && !(k in value)) out.push(`${path ? `${path}.` : ''}${k} is required`);
    if (isObj(s.properties)) for (const [k, sub] of Object.entries(s.properties)) if (k in value) walk(value[k], sub, `${path ? `${path}.` : ''}${k}`, depth + 1, out);
  }
}
export function validateMcpArgs(args: unknown, schema: unknown): string[] {
  const out: string[] = [];
  walk(args, isObj(schema) ? schema : { type: 'object' }, '', 0, out);
  return out.slice(0, MAX_PROBLEMS);
}
