/* tslint:disable */
/* eslint-disable */

export class DocSession {
    free(): void;
    [Symbol.dispose](): void;
    blocks(): string;
    insert(block: number, utf8_byte_offset: number, text: string): void;
    constructor(bytes: Uint8Array);
    page_info(): string;
    paginate(): number;
    render_png(page: number, scale: number): Uint8Array;
    replace_range(block: number, utf8_start: number, utf8_end: number, text: string): void;
    /**
     * `hunks_json`: `[[start, end, "text"], ...]`, ascending offsets in the original paragraph.
     */
    replace_ranges(block: number, hunks_json: string): void;
    save(): Uint8Array;
    text(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_docsession_free: (a: number, b: number) => void;
    readonly docsession_blocks: (a: number) => [number, number];
    readonly docsession_insert: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly docsession_new: (a: number, b: number) => [number, number, number];
    readonly docsession_page_info: (a: number) => [number, number];
    readonly docsession_paginate: (a: number) => number;
    readonly docsession_render_png: (a: number, b: number, c: number) => [number, number, number, number];
    readonly docsession_replace_range: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly docsession_replace_ranges: (a: number, b: number, c: number, d: number) => [number, number];
    readonly docsession_save: (a: number) => [number, number, number, number];
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
