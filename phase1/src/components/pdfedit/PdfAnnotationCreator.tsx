import { useState } from "react";
import {
  usePdfSession,
  editPdf,
  placePdfAnnotation,
} from "../../lib/pdfedit/session";
import type {
  PdfAnnotation,
  MarkupAnnotation,
} from "../../lib/pdfannotate/types";
import { pdfButton } from "./PdfInlineEditor";
const input =
  "mt-1 w-full rounded-sm border border-subtle bg-transparent p-1.5";
export function PdfAnnotationCreator() {
  const s = usePdfSession();
  const [kind, setKind] = useState<"note" | MarkupAnnotation["kind"]>(
    "highlight",
  );
  const [contents, setContents] = useState(""),
    [color, setColor] = useState("#ffe033"),
    [opacity, setOpacity] = useState(0.4);
  const [x, setX] = useState(36),
    [y, setY] = useState(60),
    [width, setWidth] = useState(160),
    [height, setHeight] = useState(18);
  if (!s) return null;
  const disabled = !s.editing || s.busy;
  const annotation = (): PdfAnnotation => {
    const rgb = [1, 3, 5].map(
      (i) => parseInt(color.slice(i, i + 2), 16) / 255,
    ) as [number, number, number];
    const base = {
      page: s.page - 1,
      color: rgb,
      opacity,
      contents,
      author: "",
    };
    return kind === "note"
      ? { ...base, kind, position: { x, y } }
      : { ...base, kind, rects: [{ x, y, width, height }] };
  };
  return (
    <section
      className="mt-4 grid gap-3 border-t border-subtle pt-3"
      aria-label="Create PDF annotation"
    >
      <h3>Create annotation</h3>
      <p className="text-ink-3">
        Draw a rectangle for page markup, or click to place a text note. These
        are PDF annotations, not changes to the page text.
      </p>
      <fieldset disabled={disabled} className="grid gap-3">
        <label>
          Type
          <select
            aria-label="PDF annotation type"
            className={input}
            value={kind}
            onChange={(e) => {
              const k = e.target.value as typeof kind;
              setKind(k);
              setOpacity(k === "highlight" ? 0.4 : 1);
            }}
          >
            <option value="highlight">Highlight</option>
            <option value="underline">Underline</option>
            <option value="strikeout">StrikeOut</option>
            <option value="note">Text note</option>
          </select>
        </label>
        <label>
          Comment
          <textarea
            aria-label="New annotation comment"
            className={input + " min-h-20 select-text"}
            value={contents}
            maxLength={20000}
            onChange={(e) => setContents(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Color
            <input
              aria-label="Annotation color"
              type="color"
              className={input}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Opacity (%)
            <input
              aria-label="Annotation opacity"
              type="number"
              min={5}
              max={100}
              className={input}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            />
          </label>
        </div>
        <button
          className={pdfButton + " bg-hover"}
          disabled={kind === "note" && !contents.trim()}
          onClick={() => placePdfAnnotation(s.name, annotation())}
        >
          {kind === "note" ? "Place text note on page" : "Draw markup on page"}
        </button>
        <details>
          <summary className="cursor-pointer text-ink-3">
            Coordinate placement
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["X", x, setX],
                ["Y", y, setY],
                ...(kind === "note"
                  ? []
                  : [
                      ["Width", width, setWidth],
                      ["Height", height, setHeight],
                    ]),
              ] as [string, number, (v: number) => void][]
            ).map(([label, v, set]) => (
              <label key={label}>
                {label} (pt)
                <input
                  aria-label={`Annotation ${label}`}
                  className={input}
                  type="number"
                  value={v}
                  onChange={(e) => set(Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-ink-3">
            PDF points from bottom-left. A note uses its top-left anchor, with a
            20 x 20 pt icon.
          </p>
          <button
            className={pdfButton}
            disabled={kind === "note" && !contents.trim()}
            onClick={() =>
              void editPdf(s.name, {
                kind: "annotation",
                annotation: annotation(),
              })
            }
          >
            Add annotation at coordinates
          </button>
        </details>
      </fieldset>
      {s.annotationPlacement && (
        <>
          <p role="status">
            {s.annotationPlacement.kind === "note"
              ? "Click the page to place your note."
              : "Drag a rectangle on the page."}{" "}
            Escape cancels.
          </p>
          <button
            className={pdfButton}
            onClick={() => placePdfAnnotation(s.name, null)}
          >
            Cancel annotation placement
          </button>
        </>
      )}
    </section>
  );
}
