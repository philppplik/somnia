import { test } from "node:test";
import assert from "node:assert/strict";
import { createPdfEditDocument } from "./model";
import { applyRevisionedPdfCommand, assertPdfEditRevision } from "./commands";
test("command boundary gates capabilities and rejects stale/closed/reopened source tokens", () => {
  const token = {
    documentId: "doc-one",
    sourceHash: "sha256:original",
    revision: 2,
  };
  const capabilities = {
    organize: true,
    annotate: true,
    fillForms: true,
    reason: null,
  };
  const command = { kind: "rotate", sourcePage: 0 } as const;
  const result = applyRevisionedPdfCommand(
    createPdfEditDocument(1),
    token,
    capabilities,
    { token, command },
  );
  assert.equal(result.token.revision, 3);
  assert.equal(result.document.pages[0].rotation, 90);
  assert.equal(token.revision, 2);
  for (const changed of [
    { ...token, revision: 1 },
    { ...token, documentId: "doc-two" },
    { ...token, sourceHash: "different" },
  ])
    assert.throws(() => assertPdfEditRevision(token, changed), /Stale/);
  assert.throws(
    () =>
      applyRevisionedPdfCommand(
        createPdfEditDocument(1),
        token,
        { ...capabilities, organize: false, reason: "Signed PDF" },
        { token, command },
      ),
    /Signed PDF/,
  );
});
