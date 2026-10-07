export type PdfFieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist' | 'button' | 'signature' | 'unknown';

export interface PdfFieldInfo {
  /** Fully qualified field name (unique within the document). */
  readonly name: string;
  readonly kind: PdfFieldKind;
  /** text: string; checkbox: boolean; radio: selected option or null; dropdown/optionlist: selected options. */
  readonly value: string | boolean | readonly string[] | null;
  /** radio / dropdown / optionlist only. */
  readonly options?: readonly string[];
  readonly readOnly: boolean;
  readonly required: boolean;
  /** text only. */
  readonly multiline?: boolean;
  readonly maxLength?: number;
  /** dropdown only: user may type a custom value. */
  readonly editable?: boolean;
  /** optionlist only. */
  readonly multiSelect?: boolean;
}

export type PdfFieldValue = string | boolean | readonly string[] | null;

export interface PdfFillOptions {
  /** Burn values into page content and remove the form. Default false. */
  readonly flatten?: boolean;
  /** Allow writing read-only fields. Default false (they are reported as errors). */
  readonly overrideReadOnly?: boolean;
  /** Dropdown/optionlist: accept values not in the option list by adding them. Default false. */
  readonly addMissingOptions?: boolean;
}

export interface PdfFieldError {
  readonly field: string;
  readonly code: 'not-found' | 'read-only' | 'type-mismatch' | 'invalid-option' | 'max-length' | 'unsupported' | 'encoding' | 'error';
  readonly message: string;
}

export interface PdfFillResult {
  readonly bytes: Uint8Array;
  readonly applied: readonly string[];
  readonly errors: readonly PdfFieldError[];
  readonly flattened: boolean;
}

export const PDFFORMS_OP_TYPE = 'pdfforms.fill';
export const PDFFORMS_OP_VERSION = 1;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** Same shape as imageedit ImageOperation: plain JSON, safe to store and replay. */
export interface PdfFormOperation {
  readonly id: string;
  readonly type: typeof PDFFORMS_OP_TYPE;
  readonly version: number;
  readonly enabled: boolean;
  readonly params: {
    readonly values: Readonly<Record<string, JsonValue>>;
    readonly flatten: boolean;
    readonly overrideReadOnly: boolean;
    readonly addMissingOptions: boolean;
  };
}
