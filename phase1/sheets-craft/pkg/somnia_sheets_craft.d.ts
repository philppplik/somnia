/* tslint:disable */
/* eslint-disable */

export class HeadlessWorkbook {
    free(): void;
    [Symbol.dispose](): void;
    export_xlsx(): Uint8Array;
    /**
     * Import atomically: a failed open does not destroy the previous document.
     */
    constructor(bytes: Uint8Array);
    /**
     * Bounded viewport reads. Coordinates are zero-based; returns typed value + formula.
     */
    range(sheet: number, row: number, col: number, rows: number, cols: number): string;
    redo(): string;
    /**
     * Use the real command path, including dependent recalculation and undo snapshots.
     */
    set_cell(sheet: number, address: string, input: string): string;
    /**
     * Used extent of a sheet (end-exclusive) plus history availability, for the grid shell.
     */
    sheet_info(sheet: number): string;
    sheets(): string;
    undo(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_headlessworkbook_free: (a: number, b: number) => void;
    readonly headlessworkbook_export_xlsx: (a: number) => [number, number, number, number];
    readonly headlessworkbook_new: (a: number, b: number) => [number, number, number];
    readonly headlessworkbook_range: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly headlessworkbook_redo: (a: number) => [number, number, number, number];
    readonly headlessworkbook_set_cell: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly headlessworkbook_sheet_info: (a: number, b: number) => [number, number, number, number];
    readonly headlessworkbook_sheets: (a: number) => [number, number, number, number];
    readonly headlessworkbook_undo: (a: number) => [number, number, number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
