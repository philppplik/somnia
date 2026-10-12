# Command parameter forms

`SchemaForm` is the shared UI client of a CommandSpec parameter schema. The palette supplies the full schema, including optional parameters. An empty object schema still runs without opening a form. Legacy-only commands retain their old behavior. Existing inspectors (`inspectorModel`, `componentProps`, `panelContract`) are not converted in this wave.

## Supported controls

- Strings, numbers and integers use the token-styled Input component. Numeric parsing rejects empty input, non-finite values and fractional integers.
- Enums and booleans use labelled selects. False and zero are actual values, not missing answers.
- Objects with a bounded properties list become nested fieldsets.
- Arrays, union/combinator schemas and objects without a properties list use a JSON textarea. This is a deliberate fallback, not a partial schema interpretation.
- Optional fields have an inclusion checkbox. Omitted fields stay omitted, even when their schema has a default. Required defaults and const values initialize the form.
- A string `x-i18n` annotation resolves through the app translator; title and property name are fallbacks. It is annotation-only in the fail-closed MCP validator.

Submission uses `checkMcpArgs`, the same validator as command dispatch. Invalid JSON is kept as input text and blocks submission, rather than silently submitting an older parsed value. Unsupported schema keywords still fail closed. Schema walks, controls and defaults are bounded. Schemas do not execute code or render HTML.

## Agent use

External MCP tool call approval uses a read-only SchemaForm when the discovered tool schema is available. The exact original JSON is also retained. Parameters cannot be edited in this review: no callback is fired, defaults are not added and pending arguments are not changed. Server-start approval keeps its existing command/arguments view. Deny, Allow once and the digest-bound session grant are unchanged. This wave does not add tool execution or bypass proposal review.

The component does not dispatch commands. The palette still calls the existing command execution path only after a validated submission. Pass a new React key when changing the schema or proposal, so field state does not leak into the next request.

## Verification

- `src/lib/schemaFormModel.test.ts` and `src/components/SchemaForm.test.tsx` cover typing, defaults, validation, escaping and immutable review.
- `tests/schema-form.spec.ts` exercises input correction, optional omission, JSON syntax errors and read-only review in a browser.
- `/test/schema-form-preview.html` is a Vite-only test render using the real component and app styles. Add `?review` for the immutable view. It is not imported into the app and is not a production entry point.
- No existing pixel goldens are updated by this package. Parameterless palette layout is retained; the new parameter view needs deliberate golden review if a downstream snapshot includes it.
