import { PdfMarkupProperties } from "./PdfMarkupProperties";
import { commentThreads } from "../../lib/pdfedit/commentThreads";
import { useState } from "react";
import {
  editPdf,
  getPdfSession,
  selectPdfPage,
  usePdfSession,
} from "../../lib/pdfedit/session";
import type { PdfComment } from "../../lib/pdfedit/comments";
import { pdfButton } from "./PdfInlineEditor";
function CommentCard({
  comment,
  name,
  disabled,
}: {
  comment: PdfComment;
  name: string;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(comment.contents),
    [replying, setReplying] = useState(false),
    [replyText, setReplyText] = useState("");
  const page = comment.target.page + 1;
  return (
    <article
      className="rounded-lg border border-subtle p-3"
      aria-label={`Comment on page ${page}`}
      data-testid="pdf-comment"
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <button
          className={pdfButton + " !px-0 text-accent"}
          onClick={() => selectPdfPage(name, page)}
          aria-label={`Show comment page ${page}`}
        >
          Page {page}
        </button>
        <span className="text-ink-3">
          {comment.subtype}
          {comment.reply ? " · Reply" : ""}
        </span>
      </div>
      {comment.author && (
        <p className="mt-1 break-words text-ink-3">{comment.author}</p>
      )}
      {editing ? (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void editPdf(name, {
              kind: "comment.update",
              target: comment.target,
              contents: draft,
            });
          }}
        >
          <textarea
            className="min-h-24 w-full resize-y rounded-sm border border-subtle bg-transparent p-2 select-text"
            aria-label="Edit comment text"
            maxLength={20_000}
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              className={pdfButton + " bg-hover"}
              disabled={disabled || draft === comment.contents}
            >
              Save comment
            </button>
            <button
              type="button"
              className={pdfButton}
              disabled={disabled}
              onClick={() => {
                setDraft(comment.contents);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words select-text">
          {comment.contents || "No comment text"}
        </p>
      )}
      {replying && (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void editPdf(name, {
              kind: "comment.reply",
              target: comment.target,
              contents: replyText,
            }).then(() => {
              if (!getPdfSession(name)?.error) {
                setReplying(false);
                setReplyText("");
              }
            });
          }}
        >
          <label>
            Reply
            <textarea
              aria-label="Write PDF reply"
              maxLength={20000}
              disabled={disabled}
              className="mt-1 min-h-24 w-full rounded-sm border border-subtle bg-transparent p-2 select-text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
          </label>
          <div className="flex gap-1">
            <button
              className={pdfButton + " bg-hover"}
              disabled={disabled || !replyText.trim()}
            >
              Add reply
            </button>
            <button
              type="button"
              className={pdfButton}
              disabled={disabled}
              onClick={() => setReplying(false)}
            >
              Cancel reply
            </button>
          </div>
        </form>
      )}
      <PdfMarkupProperties
        key={comment.target.expected}
        comment={comment}
        name={name}
        disabled={disabled || !comment.editable}
      />
      {comment.locked && <p className="mt-2 text-ink-3">Locked · view only</p>}
      {comment.hasReplies && (
        <p className="mt-2 text-ink-3">
          Has replies · thread deletion is disabled
        </p>
      )}
      {!editing && (
        <div className="mt-2 flex gap-1">
          <button
            className={pdfButton}
            disabled={disabled || !comment.editable}
            onClick={() => setEditing(true)}
          >
            Edit comment
          </button>
          {comment.canReply && (
            <button
              className={pdfButton}
              disabled={disabled || replying}
              onClick={() => setReplying(true)}
            >
              Reply to comment
            </button>
          )}
          <button
            className={pdfButton}
            disabled={disabled || !comment.editable || comment.hasReplies}
            onClick={() => {
              if (
                window.confirm(
                  `Delete this ${comment.subtype.toLowerCase()} comment on page ${page}? Its markup will also be removed. You can undo this edit.`,
                )
              )
                void editPdf(name, {
                  kind: "comment.delete",
                  target: comment.target,
                });
            }}
          >
            Delete comment
          </button>
        </div>
      )}
    </article>
  );
}
export function PdfCommentsPanel() {
  const s = usePdfSession();
  const [query, setQuery] = useState("");
  const [currentOnly, setCurrentOnly] = useState(false);
  if (!s) return null;
  const all = s.info?.comments ?? [];
  const match = (c: PdfComment) =>
    (!currentOnly || c.target.page === s.page - 1) &&
    `${c.contents} ${c.author} ${c.subtype}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase());
  const threads = commentThreads(all).filter(
    (t) => match(t.root) || t.replies.some(match),
  );
  const comments = all.filter(match);
  const card = (c: PdfComment) => (
    <CommentCard
      key={`${s.name}:${c.target.page}:${c.target.index}:${c.target.object}:${c.target.expected}`}
      comment={c}
      name={s.name}
      disabled={!s.editing || s.busy}
    />
  );
  return (
    <section aria-label="PDF comments" className="grid gap-3">
      <p className="text-ink-3">
        Notes and markup comments in this PDF. Editing text keeps the markup;
        deleting removes it. Replies stay with their original comment; thread
        deletion is disabled. Filters keep matching threads together. Links,
        form widgets and actions are not comments.
      </p>
      <label>
        Filter comments
        <input
          className="mt-1 w-full rounded-sm border border-subtle bg-transparent p-2"
          aria-label="Filter PDF comments"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={currentOnly}
          onChange={(e) => setCurrentOnly(e.target.checked)}
        />
        Current page only
      </label>
      <p role="status" className="text-ink-3">
        {comments.length} of {all.length} comments
      </p>
      {!s.editing && (
        <p className="text-ink-3">
          Choose Edit PDF to change comments in a copy.
        </p>
      )}
      {comments.length === 0 && (
        <p>
          {all.length
            ? "No matching comments."
            : "No supported comments in this PDF."}
        </p>
      )}
      {threads.map((t) => (
        <section
          key={`${t.root.target.page}:${t.root.target.object}:${t.root.target.index}`}
          aria-label="PDF comment thread"
          className="grid gap-2"
        >
          {t.orphan && (
            <p className="text-ink-3">
              Reply shown separately: parent thread could not be grouped.
            </p>
          )}
          {card(t.root)}
          {!!t.replies.length && (
            <div
              className="ml-3 grid gap-2 border-l-2 border-subtle pl-3"
              aria-label="Thread replies"
            >
              {t.replies.map(card)}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
