import { test } from "node:test";
import assert from "node:assert/strict";
import { commentThreads } from "./commentThreads";
import type { PdfComment } from "./comments";
const c = (
  id: string,
  parent: string | null = null,
  rt: string | null = null,
): PdfComment => ({
  target: { page: 0, index: 0, object: id, expected: "" },
  subtype: "Text",
  contents: id,
  author: "",
  editable: true,
  locked: false,
  reply: !!parent,
  hasReplies: false,
  parentObject: parent,
  replyType: rt,
  canReply: !parent,
});
test("threads group exact IRT roots; nested/group/missing/cyclic replies stay visible", () => {
  const all = [
    c("root"),
    c("reply", "root", "R"),
    c("legacy", "root"),
    c("nested", "reply", "R"),
    c("group", "root", "Group"),
    c("orphan", "missing", "R"),
    c("cycle", "cycle", "R"),
  ];
  const threads = commentThreads(all);
  assert.equal(threads.length, 5);
  assert.deepEqual(
    threads[0].replies.map((c) => c.contents),
    ["reply", "legacy"],
  );
  assert.equal(
    threads.flatMap((t) => [t.root, ...t.replies]).length,
    all.length,
  );
  assert.ok(threads.slice(1).every((t) => t.orphan));
});
