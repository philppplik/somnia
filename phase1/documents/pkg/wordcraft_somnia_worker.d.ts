/* tslint:disable */
/* eslint-disable */

export class DocSession {
    free(): void;
    [Symbol.dispose](): void;
    blocks(): string;
    /**
     * Caret rectangle for a top-level paragraph offset: `{"page","x","top","height"}` or `null`.
     */
    caret_at(block: number, utf8_off: number): string;
    /**
     * Page-space hit test (page units, same space as `page_info`). JSON: `null` when nothing is hit,
     * `{"block":i,"off":utf8,"editable":bool}` for a top-level paragraph, `{"block":null,"editable":false}`
     * for text inside a table cell or another story. Never guesses: offsets come from the layout.
     */
    hit_test(page: number, x: number, y: number): string;
    insert(block: number, utf8_byte_offset: number, text: string): void;
    merge_with_previous(block: number): void;
    constructor(bytes: Uint8Array);
    page_info(): string;
    paginate(): number;
    render_png(page: number, scale: number): Uint8Array;
    replace_range(block: number, utf8_start: number, utf8_end: number, text: string): void;
    /**
     * `hunks_json`: `[[start, end, "text"], ...]`, ascending offsets in the original paragraph.
     */
    replace_ranges(block: number, hunks_json: string): void;
    restore(id: number): void;
    save(): Uint8Array;
    /**
     * Highlight rectangles inside one top-level paragraph: `[[page,x,y,w,h],...]`.
     */
    selection_rects(block: number, a: number, b: number): string;
    /**
     * Cheap structural snapshot of the body (blocks are shared, not copied). Used for undo of split/merge.
     */
    snapshot(): number;
    split_block(block: number, utf8_off: number): void;
    text(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_docsession_free: (a: number, b: number) => void;
    readonly docsession_blocks: (a: number) => [number, number];
    readonly docsession_caret_at: (a: number, b: number, c: number) => [number, number];
    readonly docsession_hit_test: (a: number, b: number, c: number, d: number) => [number, number];
    readonly docsession_insert: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly docsession_merge_with_previous: (a: number, b: number) => [number, number];
    readonly docsession_new: (a: number, b: number) => [number, number, number];
    readonly docsession_page_info: (a: number) => [number, number];
    readonly docsession_paginate: (a: number) => number;
    readonly docsession_render_png: (a: number, b: number, c: number) => [number, number, number, number];
    readonly docsession_replace_range: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly docsession_replace_ranges: (a: number, b: number, c: number, d: number) => [number, number];
    readonly docsession_restore: (a: number, b: number) => [number, number];
    readonly docsession_save: (a: number) => [number, number, number, number];
    readonly docsession_selection_rects: (a: number, b: number, c: number, d: number) => [number, number];
    readonly docsession_snapshot: (a: number) => number;
    readonly docsession_split_block: (a: number, b: number, c: number) => [number, number];
    readonly docsession_text: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
