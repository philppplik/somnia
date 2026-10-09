/* tslint:disable */
/* eslint-disable */

export class PhotosCore {
    free(): void;
    [Symbol.dispose](): void;
    export_jpeg(): Uint8Array;
    export_png(): Uint8Array;
    height(): number;
    constructor(bytes: Uint8Array, max_edge: number);
    raw(): boolean;
    render(settings: string, edge: number): Uint8Array;
    source_height(): number;
    source_width(): number;
    width(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_photoscore_free: (a: number, b: number) => void;
    readonly photoscore_export_jpeg: (a: number) => [number, number, number, number];
    readonly photoscore_export_png: (a: number) => [number, number, number, number];
    readonly photoscore_height: (a: number) => number;
    readonly photoscore_new: (a: number, b: number, c: number) => [number, number, number];
    readonly photoscore_raw: (a: number) => number;
    readonly photoscore_render: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly photoscore_source_height: (a: number) => number;
    readonly photoscore_source_width: (a: number) => number;
    readonly photoscore_width: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
