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
    /**
     * Sets bold / italic / underline on a selection `(start_block, start_off)..(end_block, end_off)`
     * (UTF-8 byte offsets). `patch_json`: `{"bold":true,"italic":false,"underline":true}`, any subset.
     */
    format_range(start_block: number, start_off: number, end_block: number, end_off: number, patch_json: string): void;
    /**
     * `{"bold":"on|off|mixed","italic":...,"underline":...}` over a selection (same coordinates as `format_range`).
     */
    format_state(start_block: number, start_off: number, end_block: number, end_off: number): string;
    /**
     * Alignment, indents and spacing for whole paragraphs `first_block..=last_block`. `patch_json`: any subset of
     * `{"align":"center","indentLeft":36,"indentFirst":-18,"spaceBefore":0,"spaceAfter":8,"lineSpacing":1.5}`.
     */
    format_paragraphs(first_block: number, last_block: number, patch_json: string): void;
    /** JSON of the shared (null when mixed) effective paragraph formatting over `first_block..=last_block`. */
    paragraph_state(first_block: number, last_block: number): string;
    /** Applies Normal, Title, Subtitle, Heading1-4 or Quote to `first_block..=last_block`. */
    set_paragraph_style(first_block: number, last_block: number, style_id: string): void;
    /** `kind`: `bullet`, `numbered` or `none`. */
    set_list(first_block: number, last_block: number, kind: string): void;
    /** Moves list paragraphs by `delta` levels. */
    restart_list(first: number, last: number): void;
    styles_list(): string;
    upsert_style(json: string): string;
    delete_style(id: string): void;
    insert_toc(block: number, levels: number, title: string, pages: boolean): void;
    update_toc(block: number): void;
    remove_toc(block: number): void;
    continue_list(first: number, last: number): void;
    list_options(block: number): string;
    set_list_options(block: number, patch_json: string): void;
    shift_list_level(first_block: number, last_block: number, delta: number): void;
    /** `op`: row_above, row_below, delete_row, col_left, col_right, delete_col around the cell paragraph `block`. */
    edit_table(block: number, op: string): void;
    /** Inserts an empty table (rows 1-20, cols 1-10) plus a trailing paragraph after the top-level block holding `block`. */
    insert_table(block: number, rows: number, cols: number): void;
    /** JSON `{header:{text,editable},footer:{text,pageNumber,editable}}` for the default header and footer. */
    header_footer(): string;
    /** Sets default header/footer text and page number of every section; `undefined` keeps a part. */
    /** State of the different-first-page and odd/even header/footer options, as JSON. */
    header_footer_variants(): string;
    /** Applies {titlePage?, evenOdd?, first?:{header?,footer?,pageNumber?}, even?:{..}} atomically. */
    set_header_footer_variants(patch_json: string): void;
    set_footer_page_total(total: boolean): void;
    set_header_footer_align(header?: string | null, footer?: string | null): void;
    set_header_footer(header?: string | null, footer?: string | null, page_number?: boolean | null): void;
    /** Inserts a PNG or JPEG (5 MB, 8000 px a side, 25 MP, 200 images) as its own paragraph after `block`. */
    insert_image(block: number, bytes: Uint8Array, alt: string): void;
    /** Display width in points (10-2000) of an image paragraph; the height keeps the aspect ratio. */
    resize_image(block: number, width: number): void;
    /** Sets an image paragraph to 25, 50, 75 or 100 percent of the text width. */
    fit_image(block: number, percent: number): void;
    /** Width in points (20-1000) of the grid column under cell paragraph `block`. */
    set_col_width(block: number, width: number): void;
    /** Styles one cell (scope "cell") or the whole table ("table"); `style_json` has fill, border, rowHeight, padding. */
    style_table(block: number, scope: string, style_json: string): void;
    /** JSON `{size,landscape,width,height,margins:{top,bottom,left,right}}` of the page setup (points). */
    page_setup(): string;
    /** Sets size (a4, letter, legal, a5), landscape and margins (0-288 pt) on every section; JSON with any of those keys. */
    set_page_setup(setup_json: string): void;
    set_image_alt(block: number, alt: string): void;
    remove_image(block: number): void;
    comments(): string;
    add_comment(block: number, start: number, end: number, text: string, author: string, date: string): void;
    reply_comment(parent: number, text: string, author: string, date: string): void;
    properties(): string;
    set_properties(patch_json: string): void;
    resolve_comment(id: number, resolved: boolean): void;
    delete_comment(id: number): void;
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
    replace_checked(block: number, expected: string, hunks_json: string): string;
    restore(id: number): void;
    save(): Uint8Array;
    export_pdf(): Uint8Array;
    save_at(date: string): Uint8Array;
    save_at_by(date: string, author: string): Uint8Array;
    export_pdf_at(opts_json: string, date: string): Uint8Array;
    export_pdf_opts(opts_json: string): Uint8Array;
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
