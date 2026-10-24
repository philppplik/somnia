import { useState } from "react";
import type { PdfFieldInfo } from "../../lib/pdfforms";
import type {
  PdfEditAnnotation,
  PdfEditCommand,
  PdfEditDocument,
} from "../../lib/pdf/model";
import { pdfEditText } from "../../lib/pdf/locales";
import "./pdf-edit.css";
import {NativeButton,NativeInput,NativeSelect,Textarea} from '../ui/native-controls';
export interface PdfEditInspectorProps {
  document: PdfEditDocument;
  locale: string;
  fields: readonly PdfFieldInfo[];
  activeSourcePage: number;
  onSelectPage: (sourcePage: number) => void;
  onCommand: (command: PdfEditCommand) => void;
  onExport: () => void;
  onExtract: (sourcePages: number[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
}
/** Controlled UI: no PDF bytes, filesystem write, or hidden export occurs here. */
export function PdfEditInspector(p: PdfEditInspectorProps) {
  const t = (key: Parameters<typeof pdfEditText>[1]) =>
    pdfEditText(p.locale, key);
  const [selected, setSelected] = useState<number[]>([]);
  const [kind, setKind] = useState<PdfEditAnnotation["kind"]>("highlight");
  const [text, setText] = useState("");
  const [rect, setRect] = useState({ x: 40, y: 40, width: 180, height: 40 });
  const [fontSize, setFontSize] = useState(12),
    [color, setColor] = useState("#f5d547"),
    [opacity, setOpacity] = useState(40);
  const [localError, setLocalError] = useState<string | null>(null);
  const disabled = !!(p.disabled || p.busy);
  const command = (c: PdfEditCommand) => {
    try {
      p.onCommand(c);
      setLocalError(null);
    } catch (e) {
      setLocalError(String(e instanceof Error ? e.message : e));
    }
  };
  const move = (i: number, direction: number) => {
    const order = p.document.pages.map((n) => n.sourcePage);
    [order[i], order[i + direction]] = [order[i + direction], order[i]];
    command({ kind: "reorder", sourcePages: order });
  };
  const chosen = selected.filter((n) =>
    p.document.pages.some((pg) => pg.sourcePage === n),
  );
  return (
    <aside className="pdf-edit-inspector" aria-label={t("title")}>
      <h2>{t("title")}</h2>
      <p className="pdf-edit-hint">{t("original")}</p>
      <div className="pdf-edit-actions">
        <NativeButton disabled={disabled || !p.canUndo} onClick={p.onUndo}>
          {t("undo")}
        </NativeButton>
        <NativeButton disabled={disabled || !p.canRedo} onClick={p.onRedo}>
          {t("redo")}
        </NativeButton>
      </div>
      {(localError || p.error) && (
        <p role="alert" className="pdf-edit-error">
          {localError || p.error}
        </p>
      )}
      <section aria-label={t("pages")}>
        <h3>{t("pages")}</h3>
        {p.document.pages.map((page, i) => (
          <div className="pdf-edit-page" key={page.sourcePage}>
            <div className="pdf-edit-actions">
              <NativeInput
                type="checkbox"
                aria-label={`${t("selected")} ${i + 1}`}
                checked={chosen.includes(page.sourcePage)}
                disabled={disabled}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...chosen, page.sourcePage]
                      : chosen.filter((n) => n !== page.sourcePage),
                  )
                }
              />
              <NativeButton
                className={
                  page.sourcePage === p.activeSourcePage
                    ? "pdf-edit-active"
                    : ""
                }
                aria-current={
                  page.sourcePage === p.activeSourcePage ? "page" : undefined
                }
                onClick={() => p.onSelectPage(page.sourcePage)}
              >
                {t("page")} {i + 1}{" "}
                <small>
                  ({page.sourcePage + 1}) · {page.rotation}°
                </small>
              </NativeButton>
            </div>
            <div className="pdf-edit-actions">
              <NativeButton
                disabled={disabled}
                onClick={() =>
                  command({ kind: "rotate", sourcePage: page.sourcePage })
                }
              >
                {t("rotate")}
              </NativeButton>
              <NativeButton
                disabled={disabled || p.document.pages.length === 1}
                onClick={() => {
                  if (window.confirm(t("deleteConfirm")))
                    command({ kind: "delete", sourcePage: page.sourcePage });
                }}
              >
                {t("remove")}
              </NativeButton>
              <NativeButton
                disabled={disabled || i === 0}
                onClick={() => move(i, -1)}
                aria-label={`${t("up")} ${i + 1}`}
              >
                ↑
              </NativeButton>
              <NativeButton
                disabled={disabled || i === p.document.pages.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`${t("down")} ${i + 1}`}
              >
                ↓
              </NativeButton>
            </div>
          </div>
        ))}
        <NativeButton
          disabled={disabled || !chosen.length}
          onClick={() =>
            p.onExtract(
              p.document.pages
                .filter((pg) => chosen.includes(pg.sourcePage))
                .map((pg) => pg.sourcePage),
            )
          }
        >
          {t("extract")}
        </NativeButton>
      </section>
      <section>
        <h3>{t("annotations")}</h3>
        <p className="pdf-edit-hint">{t("coordinates")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            command({
              kind: "annotation.add",
              annotation: {
                id: crypto.randomUUID(),
                sourcePage: p.activeSourcePage,
                kind,
                rect,
                text,
                fontSize,
                opacity: opacity / 100,
                color: [1, 3, 5].map(
                  (i) => parseInt(color.slice(i, i + 2), 16) / 255,
                ) as [number, number, number],
              },
            });
          }}
        >
          <fieldset disabled={disabled}>
            <label>
              {t("annotations")}
              <NativeSelect
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as typeof kind;
                  setKind(k);
                  setOpacity(k === "highlight" ? 40 : 100);
                }}
              >
                {(["highlight", "strikethrough", "freeText"] as const).map(
                  (k) => (
                    <option key={k} value={k}>
                      {t(k)}
                    </option>
                  ),
                )}
              </NativeSelect>
            </label>
            <label>
              {t("text")}
              <Textarea
                value={text}
                maxLength={20000}
                required={kind === "freeText"}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <div className="pdf-edit-grid">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <label key={k}>
                  {t(k)}
                  <NativeInput
                    type="number"
                    required
                    step=".1"
                    min={k === "width" || k === "height" ? 2 : undefined}
                    value={rect[k]}
                    onChange={(e) =>
                      setRect({ ...rect, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="pdf-edit-grid">
              <label>
                {t("color")}
                <NativeInput
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
              <label>
                {t("opacity")}
                <NativeInput
                  type="number"
                  required
                  min={5}
                  max={100}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                />
              </label>
            </div>
            {kind === "freeText" && (
              <label>
                {t("fontSize")}
                <NativeInput
                  type="number"
                  required
                  min={1}
                  max={300}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </label>
            )}
            <NativeButton type="submit">{t("add")}</NativeButton>
          </fieldset>
        </form>
        {p.document.annotations
          .filter((a) => a.sourcePage === p.activeSourcePage)
          .map((a) => (
            <div className="pdf-edit-annotation" key={a.id}>
              <span>
                {t(a.kind)}
                {a.text && `: ${a.text}`}
              </span>
              <NativeButton
                disabled={disabled}
                aria-label={`${t("remove")} ${t(a.kind)}`}
                onClick={() => command({ kind: "annotation.remove", id: a.id })}
              >
                {t("remove")}
              </NativeButton>
            </div>
          ))}
      </section>
      <section>
        <h3>{t("forms")}</h3>
        {!p.fields.length && <p className="pdf-edit-hint">{t("noFields")}</p>}
        {p.fields.map((f) => {
          const value = Object.hasOwn(p.document.fieldValues, f.name)
            ? p.document.fieldValues[f.name]
            : f.value;
          const supported = [
            "text",
            "checkbox",
            "radio",
            "dropdown",
            "optionlist",
          ].includes(f.kind);
          const set = (v: string | boolean | string[] | null) =>
            command({ kind: "field.set", name: f.name, value: v });
          const blocked = disabled || f.readOnly || !supported;
          return (
            <div key={f.name} className="pdf-edit-field">
              <label>
                {f.name}
                {f.required ? " *" : ""}
                {f.kind === "checkbox" ? (
                  <NativeInput
                    type="checkbox"
                    disabled={blocked}
                    checked={value === true}
                    onChange={(e) => set(e.target.checked)}
                  />
                ) : f.kind === "text" ? (
                  <Textarea
                    disabled={blocked}
                    maxLength={f.maxLength}
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => set(e.target.value)}
                  />
                ) : f.kind === "dropdown" && f.editable ? (
                  <NativeInput
                    type="text"
                    disabled={blocked}
                    value={
                      Array.isArray(value)
                        ? (value[0] ?? "")
                        : typeof value === "string"
                          ? value
                          : ""
                    }
                    onChange={(e) => set(e.target.value || null)}
                  />
                ) : supported ? (
                  <NativeSelect
                    multiple={f.kind === "optionlist" && f.multiSelect}
                    disabled={blocked}
                    value={
                      f.kind === "optionlist" && f.multiSelect
                        ? Array.isArray(value)
                          ? value
                          : []
                        : Array.isArray(value)
                          ? (value[0] ?? "")
                          : typeof value === "string"
                            ? value
                            : ""
                    }
                    onChange={(e) =>
                      set(
                        f.kind === "optionlist" && f.multiSelect
                          ? Array.from(e.target.selectedOptions, (o) => o.value)
                          : e.target.value || null,
                      )
                    }
                  >
                    {!(f.kind === "optionlist" && f.multiSelect) && (
                      <option value="">-</option>
                    )}
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <span>{t("unsupported")}</span>
                )}
              </label>
              {f.readOnly && <small>{t("readonly")}</small>}
              {f.kind === "optionlist" && f.multiSelect && (
                <small>{t("options")}</small>
              )}
              <NativeButton
                disabled={
                  blocked || !Object.hasOwn(p.document.fieldValues, f.name)
                }
                onClick={() => command({ kind: "field.reset", name: f.name })}
              >
                {t("reset")}
              </NativeButton>
            </div>
          );
        })}
      </section>
      <footer>
        <p className="pdf-edit-hint">{t("pending")}</p>
        <NativeButton
          className="pdf-edit-export"
          disabled={disabled}
          onClick={p.onExport}
        >
          {p.busy ? t("busy") : t("export")}
        </NativeButton>
      </footer>
    </aside>
  );
}
