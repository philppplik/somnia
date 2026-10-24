/** Shared form semantics. Studio inspector/extension contracts remain separate adapters. */
import { checkMcpArgs, type McpArgIssue } from "./mcpSchema";
export type FormSchema = Record<string, unknown>;
export const schemaObject = (value: unknown): value is FormSchema =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function schemaLabel(
  schema: FormSchema,
  name: string,
  t: (key: string) => string,
): string {
  const key = schema["x-i18n"];
  if (typeof key === "string") {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return typeof schema.title === "string" && schema.title ? schema.title : name;
}
/** Only required defaults are initialized. Omitted optional parameters must stay omitted. */
export function requiredDefaults(
  schema: FormSchema,
  depth = 0,
  budget = { nodes: 0 },
): unknown {
  if (depth > 8 || ++budget.nodes > 200) return undefined;
  if (Object.hasOwn(schema, "const")) return schema.const;
  if (Object.hasOwn(schema, "default")) return schema.default;
  if (schema.type !== "object" || !schemaObject(schema.properties))
    return undefined;
  const out: Record<string, unknown> = {};
  for (const name of Array.isArray(schema.required) ? schema.required : []) {
    if (typeof name !== "string" || !schemaObject(schema.properties[name]))
      continue;
    const value = requiredDefaults(schema.properties[name], depth + 1, budget);
    if (value !== undefined)
      Object.defineProperty(out, name, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return out;
}
export function parseSchemaInput(
  schema: FormSchema,
  raw: string,
): { ok: true; value: unknown } | { ok: false } {
  if (schema.type === "string") return { ok: true, value: raw };
  if (schema.type === "number" || schema.type === "integer") {
    if (
      !raw.trim() ||
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())
    )
      return { ok: false };
    const value = Number(raw);
    return Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isInteger(value))
      ? { ok: true, value }
      : { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}
export function formIssues(
  schema: FormSchema,
  value: unknown,
): readonly McpArgIssue[] {
  const result = checkMcpArgs(value, schema);
  return result.ok ? [] : result.issues;
}
export function hasFormParameters(schema?: FormSchema): boolean {
  return (
    !!schema &&
    ((schemaObject(schema.properties) &&
      Object.keys(schema.properties).length > 0) ||
      ["anyOf", "oneOf", "allOf"].some((k) => Array.isArray(schema[k])) ||
      (Array.isArray(schema.required) && schema.required.length > 0))
  );
}
