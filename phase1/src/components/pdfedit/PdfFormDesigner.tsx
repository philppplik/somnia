import { useState } from "react";
import {
  usePdfSession,
  editPdf,
  selectPdfPage,
} from "../../lib/pdfedit/session";
import type {
  DesignField,
  DesignFieldKind,
  FieldProperties,
} from "../../lib/pdfedit/formDesign";
import { pdfButton } from "./PdfInlineEditor";
const input =
  "mt-1 w-full rounded-sm border border-subtle bg-transparent p-1.5";
const defaults = (page: number): FieldProperties => ({
  page,
  x: 36,
  y: 80,
  width: 180,
  height: 28,
  required: false,
  readOnly: false,
  value: "",
  multiline: false,
  maxLength: null,
  fontSize: 12,
  options: ["Option 1", "Option 2"],
});
function Editor({
  name,
  entry,
  disabled,
  page,
}: {
  name: string;
  entry?: DesignField;
  disabled: boolean;
  page: number;
}) {
  const [fieldName, setName] = useState(entry?.name ?? "");
  const [kind, setKind] = useState<DesignFieldKind>(entry?.kind ?? "text");
  const [p, setP] = useState<FieldProperties>(
    entry?.properties ?? defaults(page),
  );
  const change = (patch: Partial<FieldProperties>) =>
    setP((s) => ({ ...s, ...patch }));
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void editPdf(
          name,
          entry
            ? {
                kind: "field.properties",
                name: entry.name,
                expected: entry.expected,
                properties: p,
              }
            : {
                kind: "field.create",
                name: fieldName,
                fieldKind: kind,
                properties: { ...p, page },
              },
        );
      }}
    >
      <fieldset
        disabled={disabled || (!!entry && !entry.editable)}
        className="grid gap-3"
      >
        <label>
          Field name
          <input
            aria-label="Design field name"
            className={input}
            value={fieldName}
            maxLength={100}
            disabled={!!entry}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {!entry && (
          <label>
            Field type
            <select
              aria-label="Design field type"
              className={input}
              value={kind}
              onChange={(e) => {
                const k = e.target.value as DesignFieldKind;
                setKind(k);
                change({
                  value: k === "checkbox" ? false : "",
                  width: k === "checkbox" ? 20 : 180,
                  height: k === "checkbox" ? 20 : 28,
                });
              }}
            >
              <option value="text">Text field</option>
              <option value="checkbox">Checkbox</option>
              <option value="dropdown">Dropdown</option>
            </select>
          </label>
        )}
        <p className="text-ink-3">
          {entry
            ? `Page ${p.page + 1} · ${kind}`
            : `New field on page ${page + 1}`}{" "}
          · Position and size are PDF points from the bottom-left.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["x", "y", "width", "height"] as const).map((k) => (
            <label key={k}>
              {k}
              <input
                aria-label={`Field ${k}`}
                type="number"
                step="1"
                className={input}
                value={p[k]}
                onChange={(e) => change({ [k]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        {kind === "checkbox" ? (
          <label className="flex items-center gap-2">
            <input
              aria-label="Field checked"
              style={{ width: "auto" }}
              type="checkbox"
              checked={Boolean(p.value)}
              onChange={(e) => change({ value: e.target.checked })}
            />
            Checked
          </label>
        ) : (
          <>
            <label>
              Value
              <textarea
                aria-label="Field design value"
                className={input}
                value={String(p.value)}
                onChange={(e) => change({ value: e.target.value })}
              />
            </label>
            <label>
              Font size
              <input
                aria-label="Field font size"
                type="number"
                min="4"
                max="100"
                className={input}
                value={p.fontSize}
                onChange={(e) => change({ fontSize: Number(e.target.value) })}
              />
            </label>
          </>
        )}
        {kind === "text" && (
          <>
            <label className="flex items-center gap-2">
              <input
                aria-label="Field multiline"
                style={{ width: "auto" }}
                type="checkbox"
                checked={p.multiline}
                onChange={(e) => change({ multiline: e.target.checked })}
              />
              Multiline
            </label>
            <label>
              Max length (empty = unlimited)
              <input
                aria-label="Field max length"
                type="number"
                min="1"
                max="100000"
                className={input}
                value={p.maxLength ?? ""}
                onChange={(e) =>
                  change({
                    maxLength: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          </>
        )}
        {kind === "dropdown" && (
          <label>
            Options (one per line)
            <textarea
              aria-label="Field options"
              className={input + " min-h-20 select-text"}
              value={p.options.join("\n")}
              onChange={(e) => change({ options: e.target.value.split("\n") })}
            />
          </label>
        )}
        <div className="flex flex-wrap gap-3">
          {(["required", "readOnly"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                aria-label={
                  k === "required" ? "Field required" : "Field read only"
                }
                style={{ width: "auto" }}
                type="checkbox"
                checked={p[k]}
                onChange={(e) => change({ [k]: e.target.checked })}
              />
              {k === "required" ? "Required" : "Read only"}
            </label>
          ))}
        </div>
        <button
          className={pdfButton + " bg-hover"}
          disabled={!fieldName.trim()}
        >
          {entry ? "Save field properties" : "Create field"}
        </button>
      </fieldset>
      {entry?.reason && (
        <p role="note" className="text-ink-3">
          {entry.reason}
        </p>
      )}
    </form>
  );
}
export function PdfFormDesigner() {
  const s = usePdfSession();
  const [selected, setSelected] = useState<string | null>(null);
  if (!s) return null;
  const fields = s.info?.designFields ?? [];
  const entry = fields.find((f) => f.name === selected);
  return (
    <section
      className="mt-4 grid gap-3 border-t border-subtle pt-3"
      aria-label="PDF form designer"
    >
      <h3>Design form fields</h3>
      <p className="text-ink-3">
        Create text fields, checkboxes and dropdowns, or change an existing
        single-widget field. Save a copy to preserve the original.
      </p>
      <label>
        Field properties
        <select
          aria-label="Choose field properties"
          className={input}
          value={entry?.name ?? ""}
          onChange={(e) => setSelected(e.target.value || null)}
        >
          <option value="">Create new field</option>
          {fields.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} · {f.kind}
            </option>
          ))}
        </select>
      </label>
      {entry && (
        <button
          className={pdfButton + " text-left"}
          onClick={() => selectPdfPage(s.name, entry.properties.page + 1)}
        >
          Show field page {entry.properties.page + 1}
        </button>
      )}
      <Editor
        key={`${s.name}:${entry?.name ?? "new"}:${entry?.expected ?? s.page}`}
        name={s.name}
        entry={entry}
        page={s.page - 1}
        disabled={!s.editing || s.busy}
      />
    </section>
  );
}
