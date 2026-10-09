import { useState } from "react";
import {
  editPdf,
  selectPdfMarkup,
  selectPdfPage,
  usePdfSession,
} from "../../lib/pdfedit/session";
import type { PdfComment } from "../../lib/pdfedit/comments";
import type { MarkupProperties } from "../../lib/pdfedit/markupProperties";
import { pdfButton } from "./PdfInlineEditor";
const input =
  "mt-1 w-full rounded-sm border border-subtle bg-transparent p-1.5";
export function PdfMarkupProperties({
  comment,
  name,
  disabled,
}: {
  comment: PdfComment;
  name: string;
  disabled: boolean;
}) {
  const original = comment.markup?.properties;
  const [p, setP] = useState<MarkupProperties | null>(original ?? null);
  const s = usePdfSession(name);
  if (!p) return <p className="mt-2 text-ink-3">{comment.markup?.reason}</p>;
  const color =
    "#" +
    p.color
      .map((n) =>
        Math.round(n * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  return (
    <details className="mt-2">
      <summary className="cursor-pointer">Markup properties</summary>
      <form
        className="mt-3 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void editPdf(name, {
            kind: "comment.properties",
            target: comment.target,
            properties: p,
          });
        }}
      >
        <p className="text-ink-3">
          Changes regenerate the appearance. Original comment and replies stay
          attached.
        </p>
        <fieldset disabled={disabled} className="grid grid-cols-2 gap-2">
          {(["x", "y", "width", "height"] as const).map((k) => (
            <label key={k}>
              {k} (pt)
              <input
                type="number"
                step=".01"
                className={input}
                aria-label={`Markup ${k}`}
                disabled={
                  comment.subtype === "Text" &&
                  (k === "width" || k === "height")
                }
                value={p.rect[k]}
                onChange={(e) =>
                  setP({
                    ...p,
                    rect: { ...p.rect, [k]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          <label>
            Color
            <input
              type="color"
              aria-label="Markup color"
              className={input}
              value={color}
              onChange={(e) =>
                setP({
                  ...p,
                  color: [1, 3, 5].map(
                    (i) => parseInt(e.target.value.slice(i, i + 2), 16) / 255,
                  ) as [number, number, number],
                })
              }
            />
          </label>
          <label>
            Opacity (%)
            <input
              type="number"
              min={5}
              max={100}
              aria-label="Markup opacity"
              className={input}
              value={Math.round(p.opacity * 100)}
              onChange={(e) =>
                setP({ ...p, opacity: Number(e.target.value) / 100 })
              }
            />
          </label>
        </fieldset>
        <button className={pdfButton + " bg-hover"} disabled={disabled}>
          Save markup properties
        </button>
        <button
          type="button"
          className={pdfButton}
          disabled={disabled}
          onClick={() => {
            selectPdfPage(name, comment.target.page + 1);
            selectPdfMarkup(
              name,
              s?.markupSelected === comment.target.object
                ? null
                : comment.target.object,
            );
          }}
        >
          {s?.markupSelected === comment.target.object
            ? "Exit markup layout"
            : "Move / resize on page"}
        </button>
      </form>
    </details>
  );
}
