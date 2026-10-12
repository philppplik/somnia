import { useId, useState, type ReactNode } from "react";
import { useT } from "../lib/useT";
import {
  schemaObject,
  schemaLabel,
  requiredDefaults,
  parseSchemaInput,
  formIssues,
  type FormSchema,
} from "../lib/schemaFormModel";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export interface SchemaFormProps {
  schema: FormSchema;
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Reviews are immutable: no callbacks, defaults, or changes to the proposal. */
  readOnly?: boolean;
}
/** A UI client of the command schema, not a dispatcher. Remount with a key for a new proposal/spec. */
export function SchemaForm({
  schema,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  readOnly = false,
}: SchemaFormProps) {
  const { t } = useT();
  const id = useId();
  const [values, setValues] = useState<Record<string, unknown>>(
    () =>
      initialValues ??
      (requiredDefaults(schema) as Record<string, unknown>) ??
      {},
  );
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const issues = formIssues(schema, values);
  const rawErrors = Object.keys(invalid).filter((path) => invalid[path]);
  const flag = (path: string, bad: boolean) =>
    setInvalid((old) => ({ ...old, [path]: bad }));
  const clear = (path: string) =>
    setInvalid((old) =>
      Object.fromEntries(
        Object.entries(old).filter(
          ([key]) => key !== path && !key.startsWith(path + "/"),
        ),
      ),
    );
  let rendered = 0;
  const field = (
    s: FormSchema,
    name: string,
    path: string,
    value: unknown,
    required: boolean,
    change: (value: unknown) => void,
    depth: number,
  ): ReactNode => {
    const label = schemaLabel(s, name, t),
      inputId = `${id}-${encodeURIComponent(path)}`;
    const error =
      submitted &&
      (invalid[path] ||
        issues.some(
          (issue) => issue.path === path.split("/").slice(1).join("."),
        ));
    const present = value !== undefined;
    const common = {
      id: inputId,
      "aria-invalid": error || undefined,
      "aria-describedby":
        typeof s.description === "string"
          ? `${inputId}-description`
          : undefined,
      disabled: busy,
      readOnly: readOnly || Object.hasOwn(s, "const"),
    };
    const complex = ["anyOf", "oneOf", "allOf"].some((k) =>
      Array.isArray(s[k]),
    );
    const objectFields =
      s.type === "object" &&
      schemaObject(s.properties) &&
      Object.keys(s.properties).length <= 100 &&
      !complex &&
      !Object.hasOwn(s, "const") &&
      depth < 8 &&
      ++rendered < 200;
    let control: ReactNode;
    if (objectFields) {
      const record = schemaObject(value) ? value : {};
      control = (
        <fieldset className="space-y-3 rounded-sm border border-subtle p-3">
          <legend className="px-1 text-ink-2">{label}</legend>
          {Object.entries(s.properties as FormSchema)
            .slice(0, 100)
            .map(([key, prop]) =>
              schemaObject(prop)
                ? field(
                    prop,
                    key,
                    `${path}/${key}`,
                    record[key],
                    Array.isArray(s.required) && s.required.includes(key),
                    (next) => {
                      const copy = { ...record };
                      if (next === undefined) delete copy[key];
                      else
                        Object.defineProperty(copy, key, {
                          value: next,
                          enumerable: true,
                          writable: true,
                          configurable: true,
                        });
                      change(copy);
                    },
                    depth + 1,
                  )
                : null,
            )}
        </fieldset>
      );
    } else if (Array.isArray(s.enum) && s.enum.length <= 100) {
      control = (
        <select
          {...common}
          disabled={readOnly || busy || Object.hasOwn(s, "const")}
          className="h-9 w-full px-2"
          value={
            present
              ? String(
                  s.enum.findIndex(
                    (option) =>
                      JSON.stringify(option) === JSON.stringify(value),
                  ),
                )
              : ""
          }
          onChange={(e) => {
            change((s.enum as unknown[])[Number(e.target.value)]);
            flag(path, false);
          }}
        >
          <option value="" disabled>
            {t("schemaForm.choose")}
          </option>
          {s.enum.map((option, i) => (
            <option key={i} value={i}>
              {typeof option === "string" ? option : JSON.stringify(option)}
            </option>
          ))}
        </select>
      );
    } else if (s.type === "boolean") {
      control = (
        <select
          {...common}
          disabled={readOnly || busy || Object.hasOwn(s, "const")}
          className="h-9 w-full px-2"
          value={present ? String(value) : ""}
          onChange={(e) => {
            change(e.target.value === "true");
            flag(path, false);
          }}
        >
          <option value="" disabled>
            {t("schemaForm.choose")}
          </option>
          <option value="true">{t("schemaForm.yes")}</option>
          <option value="false">{t("schemaForm.no")}</option>
        </select>
      );
    } else {
      const scalar =
        !complex && ["string", "number", "integer"].includes(String(s.type));
      control = (
        <TextField
          key={path}
          schema={s}
          value={value}
          scalar={scalar}
          {...common}
          onRaw={(raw) => {
            const result = parseSchemaInput(scalar ? s : {}, raw);
            flag(path, !result.ok);
            if (result.ok) change(result.value);
          }}
        />
      );
    }
    return (
      <div key={path} className="space-y-1.5" data-schema-path={path}>
        {!required && !readOnly ? (
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              className="!w-4"
              type="checkbox"
              checked={present}
              disabled={busy}
              onChange={(e) => {
                clear(path);
                change(
                  e.target.checked
                    ? (requiredDefaults(s) ??
                        (Array.isArray(s.enum)
                          ? s.enum[0]
                          : s.type === "string"
                            ? ""
                            : s.type === "object"
                              ? {}
                              : s.type === "array"
                                ? []
                                : s.type === "boolean"
                                  ? false
                                  : s.type === "null"
                                    ? null
                                    : 0))
                    : undefined,
                );
              }}
            />
            {t("schemaForm.include", { name: label })}
          </label>
        ) : null}
        {(required || present) && (
          <>
            {!objectFields && (
              <label className="block text-xs text-ink-2" htmlFor={inputId}>
                {label}
                {required ? " *" : ""}
              </label>
            )}
            {control}
            {typeof s.description === "string" && (
              <p
                id={`${inputId}-description`}
                className="text-xs text-ink-3 break-words"
              >
                {s.description}
              </p>
            )}
            {error && (
              <p className="text-xs text-warning">
                {t("schemaForm.invalid", { name: label })}
              </p>
            )}
          </>
        )}
      </div>
    );
  };
  const content = (
    <>
      <div className="space-y-4">
        {field(
          schema,
          t("schemaForm.parameters"),
          "",
          values,
          true,
          (next) => setValues(next as Record<string, unknown>),
          0,
        )}
      </div>
      {readOnly && (
        <details className="mt-3 text-xs">
          <summary>{t("schemaForm.exact")}</summary>
          <pre
            data-copyable
            className="max-h-60 overflow-auto whitespace-pre-wrap break-all"
          >
            {JSON.stringify(initialValues ?? {}, null, 2)}
          </pre>
        </details>
      )}
      {submitted && (issues.length > 0 || rawErrors.length > 0) && (
        <div role="alert" className="mt-3 text-xs text-warning">
          {t("schemaForm.fix")}{" "}
          {issues.map((issue, i) => (
            <p key={i}>{t("schemaForm.invalid", { name: issue.path })}</p>
          ))}
        </div>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-xs text-warning">
          {t("schemaForm.failed")}
        </p>
      )}
      {!readOnly && (
        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <Button type="button" disabled={busy} onClick={onCancel}>
              {t("schemaForm.cancel")}
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {submitLabel ?? t("schemaForm.submit")}
          </Button>
        </div>
      )}
    </>
  );
  if (readOnly) return <div data-testid="schema-form-review">{content}</div>;
  return (
    <form
      data-testid="schema-form"
      noValidate
      className="text-ink"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitted(true);
        setFailed(false);
        if (issues.length || rawErrors.length || !onSubmit) return;
        setBusy(true);
        try {
          await onSubmit(values);
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {content}
    </form>
  );
}
function TextField({
  schema,
  value,
  scalar,
  onRaw,
  ...props
}: {
  schema: FormSchema;
  value: unknown;
  scalar: boolean;
  onRaw: (raw: string) => void;
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  disabled: boolean;
  readOnly: boolean;
}) {
  const [raw, setRaw] = useState(() =>
    value === undefined
      ? ""
      : schema.type === "string"
        ? String(value)
        : JSON.stringify(value, null, 2),
  );
  const change = (text: string) => {
    setRaw(text);
    onRaw(text);
  };
  if (!scalar)
    return (
      <textarea
        {...props}
        className="w-full rounded-sm border border-subtle bg-surface p-2 font-mono text-xs"
        rows={4}
        value={raw}
        onChange={(e) => change(e.target.value)}
      />
    );
  return (
    <Input
      {...props}
      type="text"
      inputMode={
        schema.type === "integer"
          ? "numeric"
          : schema.type === "number"
            ? "decimal"
            : undefined
      }
      value={raw}
      onChange={(e) => change(e.target.value)}
    />
  );
}
