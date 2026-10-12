import test from "node:test";
import assert from "node:assert/strict";
import {
  requiredDefaults,
  parseSchemaInput,
  formIssues,
  schemaLabel,
  hasFormParameters,
} from "./schemaFormModel";
import { CommandDispatcher } from "./commandDispatcher";
test("required defaults only; optional defaults stay omitted; false and zero survive", () => {
  assert.deepEqual(
    requiredDefaults({
      type: "object",
      required: ["nested", "flag"],
      properties: {
        nested: {
          type: "object",
          required: ["count"],
          properties: {
            count: { type: "integer", default: 0 },
            other: { type: "string", default: "no" },
          },
        },
        flag: { type: "boolean", default: false },
        optional: { type: "string", default: "no" },
      },
    }),
    { nested: { count: 0 }, flag: false },
  );
});
test("strict parse never turns empty input into zero or rounds an integer", () => {
  for (const raw of ["", " ", "Infinity", "4.5", "0x10", "12px"])
    assert.deepEqual(parseSchemaInput({ type: "integer" }, raw), { ok: false });
  assert.deepEqual(parseSchemaInput({ type: "number" }, "-1.5e2"), {
    ok: true,
    value: -150,
  });
  assert.deepEqual(parseSchemaInput({ type: "string" }, ""), {
    ok: true,
    value: "",
  });
  assert.deepEqual(parseSchemaInput({ type: "array" }, '["x"]'), {
    ok: true,
    value: ["x"],
  });
  assert.deepEqual(parseSchemaInput({ type: "object" }, "{"), { ok: false });
});
test("x-i18n labels fall back to title/name and annotations validate in dispatcher", async () => {
  assert.equal(
    schemaLabel(
      { "x-i18n": "label.x", title: "Fallback" },
      "x",
      () => "Translated",
    ),
    "Translated",
  );
  assert.equal(
    schemaLabel({ "x-i18n": "label.x", title: "Fallback" }, "x", (k) => k),
    "Fallback",
  );
  const schema = {
    type: "object",
    properties: {
      n: { type: "integer", minimum: 1, maximum: 5, "x-i18n": "label.n" },
    },
    required: ["n"],
    additionalProperties: false,
  };
  assert.equal(formIssues(schema, { n: 2 }).length, 0);
  assert.ok(formIssues(schema, { n: 0 }).length);
  const dispatcher = new CommandDispatcher();
  dispatcher.register({
    id: "test.form",
    title: "Form",
    category: "Tools",
    level: "ui",
    params: schema,
    run: (p) => p,
  });
  assert.deepEqual(
    await dispatcher.runCommand("test.form", { n: 3 }, { origin: "palette" }),
    { n: 3 },
  );
  await assert.rejects(() =>
    dispatcher.runCommand("test.form", { n: 2 }, { origin: "agent" }),
  );
});
test("optional/nested and complex fields trigger a form; empty object does not", () => {
  assert.ok(
    hasFormParameters({
      type: "object",
      properties: { options: { type: "object" } },
    }),
  );
  assert.ok(hasFormParameters({ oneOf: [{ type: "object" }] }));
  assert.equal(hasFormParameters({ type: "object", properties: {} }), false);
  assert.equal(hasFormParameters(undefined), false);
});
test("same fail-closed schema validation as MCP, not a weaker UI validator", () => {
  const schema = {
    type: "object",
    properties: {
      a: { type: "array", items: { type: "string" }, minItems: 1 },
      b: { type: "boolean" },
      nested: {
        type: "object",
        properties: { x: { type: "number" } },
        additionalProperties: false,
      },
    },
    required: ["a", "b"],
    additionalProperties: false,
  };
  assert.equal(
    formIssues(schema, { a: ["x"], b: false, nested: { x: 0 } }).length,
    0,
  );
  for (const value of [
    { a: [], b: true },
    { a: ["x"], b: "false" },
    { a: ["x"], b: false, extra: 1 },
    { a: ["x"], b: false, nested: { other: 2 } },
  ])
    assert.ok(formIssues(schema, value).length);
  assert.ok(
    formIssues({ type: "object", $ref: "unsafe" }, {}).some(
      (i) => i.code === "unsupported-schema",
    ),
  );
});
