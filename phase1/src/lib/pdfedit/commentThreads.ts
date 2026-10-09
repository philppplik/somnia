import type { PdfComment } from "./comments";
export interface CommentThread {
  root: PdfComment;
  replies: PdfComment[];
  orphan: boolean;
}
/** One-level PDF review threads. Unbound/cyclic/group/nested replies stay visible separately. */
export function commentThreads(comments: PdfComment[]): CommentThread[] {
  const roots = comments
    .filter((c) => !c.reply)
    .map((root) => ({ root, replies: [] as PdfComment[], orphan: false }));
  for (const c of comments.filter((c) => c.reply)) {
    const parent = roots.find(
      (t) =>
        !t.root.reply &&
        t.root.target.object !== "direct" &&
        t.root.target.object === c.parentObject,
    );
    if (parent && (c.replyType === null || c.replyType === "R"))
      parent.replies.push(c);
    else roots.push({ root: c, replies: [], orphan: true });
  }
  return roots;
}
