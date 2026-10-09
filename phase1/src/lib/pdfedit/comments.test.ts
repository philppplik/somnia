import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFHexString,
  PDFRef,
} from "pdf-lib";
import { inspectPdf, applyPdfEdit } from "./backend";
async function fixture() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([400, 500]);
  const comment = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [20, 20, 40, 40],
      Contents: PDFHexString.fromText("Review this"),
      T: PDFHexString.fromText("Reviewer"),
    }),
  );
  const popup = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Popup",
      Rect: [50, 50, 200, 200],
      Parent: comment,
    }),
  );
  doc.context.lookup(comment, PDFDict).set(PDFName.of("Popup"), popup);
  const link = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [0, 0, 10, 10],
      A: { S: "URI", URI: "https://example.com" },
    }),
  );
  doc
    .getPage(1)
    .node.set(PDFName.of("Annots"), doc.context.obj([comment, popup, link]));
  return doc.save();
}
test("lists supported comments with author/page but not links/popups", async () => {
  const info = await inspectPdf(await fixture());
  assert.equal(info.comments.length, 1);
  assert.equal(info.comments[0].contents, "Review this");
  assert.equal(info.comments[0].author, "Reviewer");
  assert.equal(info.comments[0].target.page, 1);
  assert.equal(info.comments[0].editable, true);
});
test("unicode text update preserves geometry, popup, actions and appearances", async () => {
  let b = await fixture();
  const d = await PDFDocument.load(b);
  const a = d.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray);
  const c = a.lookup(0, PDFDict);
  const ap = d.context.register(
    d.context.stream("0 0 20 20 re f", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 20, 20],
    }),
  );
  c.set(PDFName.of("AP"), d.context.obj({ N: ap }));
  c.set(PDFName.of("RC"), PDFHexString.fromText("<p>old rich content</p>"));
  b = await d.save();
  const target = (await inspectPdf(b)).comments[0].target;
  const out = await applyPdfEdit(b, {
    kind: "comment.update",
    target,
    contents: "Überschrift 漢字 <script>alert(1)</script>",
  });
  const read = await PDFDocument.load(out);
  const changed = read
    .getPage(1)
    .node.lookup(PDFName.of("Annots"), PDFArray)
    .lookup(0, PDFDict);
  assert.equal(
    (await inspectPdf(out)).comments[0].contents,
    "Überschrift 漢字 <script>alert(1)</script>",
  );
  assert.ok(changed.get(PDFName.of("AP")));
  assert.equal(changed.get(PDFName.of("RC")), undefined);
  assert.ok(changed.get(PDFName.of("Popup")));
  assert.equal(
    read.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray).size(),
    3,
  );
  assert.equal((await inspectPdf(b)).comments[0].contents, "Review this");
  await assert.rejects(
    () =>
      applyPdfEdit(out, { kind: "comment.update", target, contents: "stale" }),
    /stale/,
  );
});
test("delete removes only exact comment and its popup, preserving link", async () => {
  const b = await fixture();
  const target = (await inspectPdf(b)).comments[0].target;
  const out = await applyPdfEdit(b, { kind: "comment.delete", target });
  assert.equal((await inspectPdf(out)).comments.length, 0);
  const read = await PDFDocument.load(out);
  const a = read.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray);
  assert.equal(a.size(), 1);
  assert.equal(
    a.lookup(0, PDFDict).get(PDFName.of("Subtype")),
    PDFName.of("Link"),
  );
});
test("locked comments and replies protect thread deletion", async () => {
  let b = await fixture();
  const d = await PDFDocument.load(b);
  const a = d.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray);
  const c = a.lookup(0, PDFDict);
  c.set(PDFName.of("F"), d.context.obj(128));
  b = await d.save();
  let info = await inspectPdf(b);
  assert.equal(info.comments[0].editable, false);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "comment.delete",
        target: info.comments[0].target,
      }),
    /locked/,
  );
  c.delete(PDFName.of("F"));
  const reply = d.context.register(
    d.context.obj({
      Type: "Annot",
      Subtype: "Text",
      IRT: a.get(0),
      Contents: PDFHexString.fromText("Reply"),
    }),
  );
  a.push(reply);
  b = await d.save();
  info = await inspectPdf(b);
  assert.equal(info.comments[0].hasReplies, true);
  assert.equal(info.comments[1].reply, true);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "comment.delete",
        target: info.comments[0].target,
      }),
    /replies/,
  );
  const out = await applyPdfEdit(b, {
    kind: "comment.delete",
    target: info.comments[1].target,
  });
  assert.equal((await inspectPdf(out)).comments[0].hasReplies, false);
});
test("reorder refreshes page targets, rejects wrong object and overlong content", async () => {
  const b = await fixture();
  const old = (await inspectPdf(b)).comments[0].target;
  const moved = await applyPdfEdit(b, { kind: "move", from: 1, to: 0 });
  const info = await inspectPdf(moved);
  assert.equal(info.comments[0].target.page, 0);
  await assert.rejects(
    () => applyPdfEdit(moved, { kind: "comment.delete", target: old }),
    /stale/,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(moved, {
        kind: "comment.update",
        target: info.comments[0].target,
        contents: "x".repeat(20001),
      }),
    /20,000/,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(moved, {
        kind: "comment.delete",
        target: { ...info.comments[0].target, object: "1000 0 R" },
      }),
    /stale/,
  );
});
test("direct dictionaries and indirect flags are handled without bypassing locks", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const a = doc.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [0, 0, 20, 20],
    Contents: PDFHexString.fromText("Direct comment"),
    F: doc.context.register(doc.context.obj(64)),
  });
  page.node.set(PDFName.of("Annots"), doc.context.obj([a]));
  const bytes = await doc.save();
  const info = await inspectPdf(bytes);
  assert.equal(info.comments[0].target.object, "direct");
  assert.equal(info.comments[0].locked, true);
  await assert.rejects(
    () =>
      applyPdfEdit(bytes, {
        kind: "comment.update",
        target: info.comments[0].target,
        contents: "bypass",
      }),
    /locked/,
  );
  a.delete(PDFName.of("F"));
  const unlocked = await doc.save();
  const out = await applyPdfEdit(unlocked, {
    kind: "comment.delete",
    target: (await inspectPdf(unlocked)).comments[0].target,
  });
  assert.equal((await inspectPdf(out)).comments.length, 0);
});

test("new reply roundtrips IRT/RT/page/AP/unicode without adding a visible duplicate icon", async () => {
  let b = await fixture(),
    root = (await inspectPdf(b)).comments[0];
  b = await applyPdfEdit(b, {
    kind: "comment.reply",
    target: root.target,
    contents: "Antwort 漢字",
  });
  let info = await inspectPdf(b);
  assert.equal(info.comments.length, 2);
  assert.equal(info.comments[0].hasReplies, true);
  assert.equal(info.comments[1].parentObject, root.target.object);
  assert.equal(info.comments[1].replyType, "R");
  assert.equal(info.comments[1].canReply, false);
  const doc = await PDFDocument.load(b),
    a = doc.getPage(1).node.Annots()!,
    reply = a.lookup(a.size() - 1, PDFDict);
  assert.equal(reply.get(PDFName.of("IRT"))!.toString(), root.target.object);
  assert.equal(
    reply.get(PDFName.of("P"))!.toString(),
    doc.getPage(1).ref.toString(),
  );
  assert.equal(reply.get(PDFName.of("RT")), PDFName.of("R"));
  assert.equal(reply.lookup(PDFName.of("F"))!.toString(), "2");
  assert.ok(
    reply.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N")) instanceof
      PDFRef,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "comment.delete",
        target: info.comments[0].target,
      }),
    /replies/,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "comment.reply",
        target: info.comments[1].target,
        contents: "nested",
      }),
    /original/,
  );
  b = await applyPdfEdit(b, {
    kind: "comment.update",
    target: info.comments[1].target,
    contents: "Edited reply",
  });
  info = await inspectPdf(b);
  assert.equal(info.comments[1].contents, "Edited reply");
  b = await applyPdfEdit(b, {
    kind: "comment.delete",
    target: info.comments[1].target,
  });
  assert.equal((await inspectPdf(b)).comments[0].hasReplies, false);
});
test("reply validates content, stale/locked/direct parents and source signature/XFA", async () => {
  const b = await fixture(),
    t = (await inspectPdf(b)).comments[0].target;
  for (const contents of ["", " ", "x".repeat(20001)])
    await assert.rejects(
      () => applyPdfEdit(b, { kind: "comment.reply", target: t, contents }),
      /reply/,
    );
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "comment.reply",
        target: { ...t, object: "999 0 R" },
        contents: "wrong",
      }),
    /stale/,
  );
  for (const type of ["lock", "sig", "xfa", "direct"]) {
    const d = await PDFDocument.load(b),
      a = d.getPage(1).node.Annots()!,
      c = a.lookup(0, PDFDict);
    if (type === "lock") c.set(PDFName.of("F"), d.context.obj(128));
    if (type === "sig")
      d.catalog.set(
        PDFName.of("TestSig"),
        d.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
      );
    if (type === "xfa")
      d.getForm().acroForm.dict.set(
        PDFName.of("XFA"),
        d.context.obj("unsupported"),
      );
    if (type === "direct") {
      const clone = d.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [20, 20, 40, 40],
        Contents: PDFHexString.fromText("Direct"),
      });
      a.set(0, clone);
    }
    const bytes = await d.save({ updateFieldAppearances: false }),
      target = (await inspectPdf(bytes)).comments[0].target;
    await assert.rejects(
      () =>
        applyPdfEdit(bytes, {
          kind: "comment.reply",
          target,
          contents: "reply",
        }),
      type === "lock"
        ? /locked/
        : type === "sig"
          ? /Signed/
          : type === "xfa"
            ? /XFA/
            : /Direct/,
    );
  }
});
