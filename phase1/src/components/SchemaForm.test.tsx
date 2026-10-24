import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SchemaForm } from "./SchemaForm";
const schema = {
  type: "object",
  required: ["name", "size", "enabled"],
  properties: {
    name: { type: "string", title: "<script>name</script>" },
    size: { type: "integer", default: 0, description: "Pixels" },
    enabled: { type: "boolean", default: false },
    optional: { type: "string" },
    mode: { type: "string", enum: ["a", "b"] },
    options: { type: "object", properties: { x: { type: "number" } } },
    items: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};
test("typed accessible controls, escaped labels, optional omission and submit", () => {
  const html = renderToStaticMarkup(
    <SchemaForm schema={schema} onSubmit={() => {}} />,
  );
  assert.match(html, /data-slot="input"/);
  assert.match(html, /&lt;script&gt;name&lt;\/script&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /value="0"/);
  assert.match(html, /<option value="false" selected="">No/);
  assert.match(html, /Include optional/);
  assert.match(html, /type="submit"/);
  assert.match(html, /htmlFor|for=/);
  assert.match(html, /aria-describedby=/);
});
test("agent review has exact immutable parameters, no form/actions/default injection", () => {
  const values = {
    name: "<img>",
    size: 2,
    enabled: false,
    options: { x: 1 },
    items: ["a"],
    extra: "preserved",
  };
  const html = renderToStaticMarkup(
    <SchemaForm schema={schema} initialValues={values} readOnly />,
  );
  assert.match(html, /schema-form-review/);
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes('type="submit"'));
  assert.match(html, /readOnly=""/);
  assert.match(html, /extra/);
  assert.match(html, /preserved/);
  assert.ok(!html.includes("<img>"));
});
