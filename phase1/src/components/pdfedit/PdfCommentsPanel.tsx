import { useState } from "react";
import {
  editPdf,
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
    [draft, setDraft] = useState(comment.contents);
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
  const comments = all.filter(
    (c) =>
      (!currentOnly || c.target.page === s.page - 1) &&
      `${c.contents} ${c.author} ${c.subtype}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <section aria-label="PDF comments" className="grid gap-3">
      <p className="text-ink-3">
        Notes and markup comments in this PDF. Editing text keeps the markup;
        deleting removes it. Links, form widgets and actions are not comments.
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
      {comments.map((c) => (
        <CommentCard
          key={`${s.name}:${c.target.page}:${c.target.index}:${c.target.object}:${c.target.expected}`}
          comment={c}
          name={s.name}
          disabled={!s.editing || s.busy}
        />
      ))}
    </section>
  );
}
