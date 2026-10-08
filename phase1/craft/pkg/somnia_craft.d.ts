/* tslint:disable */
/* eslint-disable */

/**
 * Retained document spike. Owns real PhotoCraft layers/masks inside WASM.
 * Bounds match T1 until tiled documents and allocation budgets are proved.
 */
export class CraftDocument {
    free(): void;
    [Symbol.dispose](): void;
    clear_mask(index: number): void;
    duplicate_layer(index: number): void;
    layer_count(): number;
    constructor(bytes: Uint8Array, width: number, height: number);
    query(): string;
    redo(): boolean;
    render(): Uint8Array;
    set_mask(index: number, bytes: Uint8Array): void;
    set_opacity(index: number, opacity: number): void;
    set_visible(index: number, visible: boolean): void;
    undo(): boolean;
}

/**
 * Transfer-friendly bytes API. JS/WASM still copies at the memory boundary.
 */
export function gaussian_blur_rgba(bytes: Uint8Array, width: number, height: number, radius: number): Uint8Array;

export function selection_polygon(width: number, height: number, points: Float32Array): Uint8Array;

/**
 * Actual upstream selection algorithms on a bounded image-space surface.
 */
export function selection_wand_rgba(bytes: Uint8Array, width: number, height: number, x: number, y: number, tolerance: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_craftdocument_free: (a: number, b: number) => void;
    readonly craftdocument_clear_mask: (a: number, b: number) => [number, number];
    readonly craftdocument_duplicate_layer: (a: number, b: number) => [number, number];
    readonly craftdocument_layer_count: (a: number) => number;
    readonly craftdocument_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly craftdocument_query: (a: number) => [number, number];
    readonly craftdocument_redo: (a: number) => number;
    readonly craftdocument_render: (a: number) => [number, number];
    readonly craftdocument_set_mask: (a: number, b: number, c: number, d: number) => [number, number];
    readonly craftdocument_set_opacity: (a: number, b: number, c: number) => [number, number];
    readonly craftdocument_set_visible: (a: number, b: number, c: number) => [number, number];
    readonly craftdocument_undo: (a: number) => number;
    readonly gaussian_blur_rgba: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly selection_polygon: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly selection_wand_rgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
