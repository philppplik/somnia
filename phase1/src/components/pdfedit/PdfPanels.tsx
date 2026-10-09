import { PdfCommentsPanel } from "./PdfCommentsPanel";
import { useEffect, useRef, useState } from "react";
import { pdfjsBackend } from "../../lib/pdfview/pdfjsBrowser";
import {
  usePdfSession,
  selectPdfPage,
  editPdf,
  searchPdf,
  pdfError,
  fillPdf,
} from "../../lib/pdfedit/session";
import type { PdfFieldValue } from "../../lib/pdfforms";
import { pdfButton } from "./PdfInlineEditor";
function Thumbnail({ bytes, page }: { bytes: Uint8Array; page: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    let doc: Awaited<ReturnType<typeof pdfjsBackend.open>> | undefined;
    let task:
      | ReturnType<
          Awaited<ReturnType<NonNullable<typeof doc>["getPage"]>>["render"]
        >
      | undefined;
    void (async () => {
      try {
        doc = await pdfjsBackend.open(bytes, { signal: ac.signal });
        if (!alive) {
          await doc.destroy();
          return;
        }
        const p = await doc.getPage(page);
        const canvas = ref.current;
        if (!alive || !canvas) return;
        const scale = Math.min(120 / p.size.width, 130 / p.size.height);
        canvas.width = Math.ceil(p.size.width * scale);
        canvas.height = Math.ceil(p.size.height * scale);
        task = p.render(canvas, scale, 0);
        await task.promise;
        if (alive) canvas.dataset.thumbnailRendered = "true";
      } catch {
        /* Main viewer reports load errors. */
      }
    })();
    return () => {
      alive = false;
      ac.abort();
      task?.cancel();
      void doc?.destroy();
    };
  }, [bytes, page]);
  return (
    <canvas
      ref={ref}
      className="mx-auto bg-white shadow-sm"
      aria-label={`Thumbnail page ${page}`}
    />
  );
}
function VisibleThumbnail({
  bytes,
  page,
}: {
  bytes: Uint8Array;
  page: number;
}) {
  const r = useRef<HTMLDivElement>(null);
  const [visible, set] = useState(false);
  useEffect(() => {
    if (!r.current) return;
    const ob = new IntersectionObserver(
      ([entry]) => set(entry.isIntersecting),
      { rootMargin: "150px" },
    );
    ob.observe(r.current);
    return () => ob.disconnect();
  }, []);
  return (
    <div ref={r} className="grid h-[134px] place-items-center">
      {visible && <Thumbnail bytes={bytes} page={page} />}
    </div>
  );
}
export function PdfPagesPanel() {
  const s = usePdfSession();
  const [tab, setTab] = useState<"pages" | "search">("pages");
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  if (!s) return null;
  const disabled = !s.editing || s.busy;
  const count = s.info?.pages.length ?? 0;
  return (
    <aside
      className="panel flex h-full min-h-0 flex-col overflow-hidden bg-panel"
      aria-label="PDF pages and search"
    >
      <div
        className="flex shrink-0 border-b border-subtle p-2"
        role="tablist"
        aria-label="PDF navigation"
      >
        <button
          role="tab"
          aria-selected={tab === "pages"}
          className={pdfButton}
          onClick={() => setTab("pages")}
        >
          Pages
        </button>
        <button
          role="tab"
          aria-selected={tab === "search"}
          className={pdfButton}
          onClick={() => setTab("search")}
        >
          Search
        </button>
      </div>
      {tab === "pages" ? (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-subtle p-2">
            <button
              className={pdfButton}
              disabled={disabled}
              title="Rotate current page clockwise"
              onClick={() =>
                void editPdf(s.name, { kind: "rotate", page: s.page - 1 })
              }
            >
              Rotate
            </button>
            <button
              className={pdfButton}
              disabled={disabled || count <= 1}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete page ${s.page}? You can undo this edit.`,
                  )
                )
                  void editPdf(s.name, { kind: "delete", page: s.page - 1 });
              }}
            >
              Delete
            </button>
            <label
              className={
                pdfButton +
                " " +
                (disabled ? "pointer-events-none opacity-40" : "")
              }
            >
              Insert PDF
              <input
                className="hidden"
                type="file"
                accept="application/pdf,.pdf"
                disabled={disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 25_000_000) {
                    pdfError(s.name, "PDF exceeds 25 MB.");
                    return;
                  }
                  void file.arrayBuffer().then((b) =>
                    editPdf(s.name, {
                      kind: "insert",
                      data: new Uint8Array(b),
                      after: s.page - 1,
                    }),
                  );
                }}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {count === 0 ? (
              <p className="p-3 text-xs text-ink-3">
                Page editing is unavailable for this PDF. Use the viewer's page
                controls.
              </p>
            ) : (
              s.info?.pages.map((p, i) => (
                <div
                  key={i}
                  className={
                    "mb-2 rounded-lg border p-2 " +
                    (s.page === i + 1
                      ? "border-accent bg-accent-soft"
                      : "border-subtle")
                  }
                  draggable={!disabled}
                  onDragStart={(e) => {
                    setDrag(i);
                    e.dataTransfer.setData("text/plain", String(i));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => {
                    if (drag !== null && !disabled) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag !== null && drag !== i && !disabled)
                      void editPdf(s.name, { kind: "move", from: drag, to: i });
                    setDrag(null);
                  }}
                >
                  <button
                    className="w-full cursor-pointer border-0 bg-transparent p-0"
                    aria-label={`Go to page ${i + 1}`}
                    aria-current={s.page === i + 1 ? "page" : undefined}
                    onClick={() => selectPdfPage(s.name, i + 1)}
                  >
                    {s.bytes && (
                      <VisibleThumbnail bytes={s.bytes} page={i + 1} />
                    )}
                    <span className="mt-2 block text-xs text-ink-2">
                      {i + 1} · {Math.round(p.width)} × {Math.round(p.height)}{" "}
                      pt
                    </span>
                  </button>
                  <div className="flex justify-center">
                    <button
                      className={pdfButton}
                      aria-label={`Move page ${i + 1} up`}
                      disabled={disabled || i === 0}
                      onClick={() =>
                        void editPdf(s.name, {
                          kind: "move",
                          from: i,
                          to: i - 1,
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      className={pdfButton}
                      aria-label={`Move page ${i + 1} down`}
                      disabled={disabled || i === count - 1}
                      onClick={() =>
                        void editPdf(s.name, {
                          kind: "move",
                          from: i,
                          to: i + 1,
                        })
                      }
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void searchPdf(s.name, query);
            }}
          >
            <input
              className="w-full rounded-sm border border-subtle bg-transparent px-2 py-1.5 text-xs"
              aria-label="Search PDF text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className={pdfButton}
              disabled={!query.trim() || s.searching}
            >
              Find
            </button>
          </form>
          <p role="status" className="py-2 text-xs text-ink-3">
            {s.searching
              ? "Searching…"
              : s.search
                ? `${s.hits.length} matching pages (up to 200)`
                : ""}
          </p>
          {s.hits.map((h) => (
            <button
              key={h.page}
              className="mb-2 w-full rounded-sm border border-subtle bg-transparent p-2 text-left text-xs text-ink-2 hover:bg-hover"
              onClick={() => selectPdfPage(s.name, h.page)}
            >
              Page {h.page}
              <span className="mt-1 block text-ink-3">{h.text}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
export function PdfPropertiesPanel() {
  const s = usePdfSession();
  const [tab, setTab] = useState<"add" | "fields" | "comments">("add");
  const [text, setText] = useState("");
  const [x, setX] = useState(36);
  const [y, setY] = useState(60);
  const [size, setSize] = useState(14);
  const [kind, setKind] = useState<
    "note" | "highlight" | "underline" | "strikeout"
  >("note");
  const [values, setValues] = useState<Record<string, PdfFieldValue>>({});
  useEffect(() => setValues({}), [s?.bytes]);
  if (!s) return null;
  const disabled = !s.editing || s.busy;
  return (
    <aside
      className="panel flex h-full min-h-0 flex-col overflow-hidden bg-panel"
      aria-label="PDF properties"
    >
      <div
        className="flex shrink-0 border-b border-subtle p-2"
        role="tablist"
        aria-label="PDF tools"
      >
        <button
          className={pdfButton}
          role="tab"
          aria-selected={tab === "add"}
          onClick={() => setTab("add")}
        >
          Add
        </button>
        <button
          className={pdfButton}
          role="tab"
          aria-selected={tab === "fields"}
          onClick={() => setTab("fields")}
        >
          Fields
        </button>
        <button
          className={pdfButton}
          role="tab"
          aria-selected={tab === "comments"}
          onClick={() => setTab("comments")}
        >
          Comments
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs text-ink-2">
        {tab === "comments" ? (
          <PdfCommentsPanel />
        ) : tab === "add" ? (
          <>
            <p className="mb-3 text-ink-3">
              {s.editing
                ? "Add content to the current page. Coordinates use PDF points from the bottom-left."
                : "Choose Edit PDF to make changes to a copy."}
            </p>
            <fieldset disabled={disabled} className="grid gap-2">
              <label>
                Text or comment
                <textarea
                  aria-label="PDF text or comment"
                  className="mt-1 min-h-20 w-full rounded-sm border border-subtle bg-transparent p-2 text-xs select-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["X", x, setX],
                    ["Y", y, setY],
                  ] as const
                ).map(([label, v, set]) => (
                  <label key={label}>
                    {label} (pt)
                    <input
                      aria-label={`PDF ${label} position`}
                      type="number"
                      className="mt-1 w-full rounded-sm border border-subtle bg-transparent px-2 py-1"
                      value={v}
                      onChange={(e) => set(Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <label>
                Font size
                <input
                  aria-label="PDF font size"
                  type="number"
                  min="1"
                  max="300"
                  className="ml-2 w-16 rounded-sm border border-subtle bg-transparent p-1"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </label>
              <button
                className={pdfButton + " bg-hover"}
                disabled={!text.trim()}
                onClick={() =>
                  void editPdf(s.name, {
                    kind: "text",
                    page: s.page - 1,
                    text,
                    x,
                    y,
                    size,
                  })
                }
              >
                Add text
              </button>
              <hr className="my-2 border-subtle" />
              <label>
                Annotation
                <select
                  aria-label="PDF annotation type"
                  className="mt-1 w-full rounded-sm border border-subtle bg-panel p-1"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  {["note", "highlight", "underline", "strikeout"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <p className="text-ink-3">
                Notes use X/Y as their anchor. Marks cover 160 × 18 pt starting
                at X/Y.
              </p>
              <button
                className={pdfButton + " bg-hover"}
                onClick={() =>
                  void editPdf(s.name, {
                    kind: "annotation",
                    annotation: {
                      page: s.page - 1,
                      color: [1, 0.7, 0],
                      opacity: kind === "note" ? 1 : 0.4,
                      contents: text,
                      author: "",
                      ...(kind === "note"
                        ? { kind: "note" as const, position: { x, y } }
                        : { kind, rects: [{ x, y, width: 160, height: 18 }] }),
                    },
                  })
                }
              >
                Add annotation
              </button>
            </fieldset>
          </>
        ) : (
          <>
            <p className="mb-3 text-ink-3">
              Fill existing form fields. Scripts, buttons and signatures are not
              executed. Multi-select lists are view-only.
            </p>
            {s.fields.length === 0 && <p>No editable form fields.</p>}
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void fillPdf(s.name, values);
              }}
            >
              {s.fields.map((f) => (
                <label key={f.name} className="block">
                  {f.name}
                  {f.required ? " *" : ""}
                  <span className="ml-1 text-ink-3">{f.kind}</span>
                  {f.kind === "checkbox" ? (
                    <input
                      aria-label={f.name}
                      type="checkbox"
                      className="ml-2"
                      disabled={disabled || f.readOnly}
                      checked={Boolean(values[f.name] ?? f.value)}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.name]: e.target.checked }))
                      }
                    />
                  ) : f.kind === "text" ? (
                    <input
                      aria-label={f.name}
                      className="mt-1 w-full rounded-sm border border-subtle bg-transparent p-1 select-text"
                      disabled={disabled || f.readOnly}
                      maxLength={f.maxLength}
                      value={String(values[f.name] ?? f.value ?? "")}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                      }
                    />
                  ) : ["radio", "dropdown", "optionlist"].includes(f.kind) ? (
                    <select
                      aria-label={f.name}
                      className="mt-1 w-full rounded-sm border border-subtle bg-panel p-1"
                      multiple={f.kind === "optionlist" && f.multiSelect}
                      disabled={disabled || f.readOnly || !!f.multiSelect}
                      value={String(
                        values[f.name] ??
                          (Array.isArray(f.value) ? f.value[0] : f.value) ??
                          "",
                      )}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [f.name]:
                            f.kind === "radio"
                              ? e.target.value
                              : [e.target.value],
                        }))
                      }
                    >
                      <option value="">None</option>
                      {f.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 text-ink-3">View only</p>
                  )}
                </label>
              ))}
              <button
                className={pdfButton + " bg-hover"}
                disabled={disabled || !Object.keys(values).length}
              >
                Apply field values
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}
