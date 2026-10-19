/* tslint:disable */
/* eslint-disable */

/**
 * Handle returned to JS.
 */
export class SoundResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Interleaved (min, max) pairs.
     */
    readonly peaks: Float32Array;
    /**
     * JSON report.
     */
    readonly report: string;
    /**
     * 16-bit PCM WAV file bytes.
     */
    readonly wav: Uint8Array;
}

/**
 * Frozen output loudness facts; code follows the pinned meter, not a conformity claim.
 */
export function analyze_mix_pcm(left: Float32Array, right: Float32Array): string;

/**
 * Plugin ids the engine offers, as JSON `[{id,name}]`.
 */
export function list_plugins(): string;

/**
 * `ext` is a hint ("mp3", "wav", ...), `recipe_json` a [`Recipe`] as JSON.
 */
export function process(bytes: Uint8Array, ext: string, recipe_json: string): SoundResult;

/**
 * Apply a bounded built-in insert rack to planar stereo 48 kHz PCM, without quantizing.
 * Same-length policy: tails are cut at the existing session boundary, never appended silently.
 */
export function process_rack_pcm(left: Float32Array, right: Float32Array, rack_json: string): Float32Array;

/**
 * Same as [`process`], reporting each stage to `progress.report(stage, index, total)` just before it starts.
 */
export function process_with_progress(bytes: Uint8Array, ext: string, recipe_json: string, progress: any): SoundResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_soundresult_free: (a: number, b: number) => void;
    readonly analyze_mix_pcm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly list_plugins: () => [number, number];
    readonly process: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly process_rack_pcm: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly process_with_progress: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly soundresult_peaks: (a: number) => [number, number];
    readonly soundresult_report: (a: number) => [number, number];
    readonly soundresult_wav: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
