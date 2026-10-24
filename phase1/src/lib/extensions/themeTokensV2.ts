/**
 * Native UI theme validation for the v2 themes contribution family.
 *
 * Interface (`ui`) themes recolor the app chrome, so the host must guarantee
 * legibility: a theme JSON is a flat map of the complete UI color token set to
 * hex colors, and every documented text/surface pair must clear its WCAG 2.x
 * contrast minimum. No var() references, no url(), no alpha-overlay tokens -
 * `--accent-soft` is host-derived and therefore not themable.
 */

/** The complete themable UI color token set (custom properties from tokens.css, colors only). */
export const UI_COLOR_TOKENS=[
 '--bg-base','--bg-panel','--bg-elevated','--bg-surface','--bg-hover',
 '--border-subtle','--border-default',
 '--text-primary','--text-secondary','--text-tertiary',
 '--accent','--accent-fill','--warning','--danger','--canvas-bg','--shell-bg',
] as const;

/** Contrast floor per token pair (WCAG 2.x: 4.5 body text, 3.0 muted text and interactive indicators). */
const CONTRAST_PAIRS:ReadonlyArray<readonly [string,string,number]>=[
 ['--text-primary','--bg-base',4.5],
 ['--text-secondary','--bg-base',4.5],
 ['--text-tertiary','--bg-base',3],
 ['--text-primary','--bg-panel',4.5],
 ['--text-secondary','--bg-panel',4.5],
 ['--accent','--bg-base',3],
 ['--warning','--bg-base',3],
 ['--danger','--bg-base',3],
];

const HEX=/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i;

function channel(v:number):number {
 const c=v/255;
 return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
}

/** WCAG 2.x relative luminance of a #rgb or #rrggbb color. */
export function relativeLuminance(hex:string):number {
 const h=hex.replace('#','');
 const full=h.length===3?[...h].map(c=>c+c).join(''):h;
 const r=parseInt(full.slice(0,2),16),g=parseInt(full.slice(2,4),16),b=parseInt(full.slice(4,6),16);
 return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);
}

/** WCAG 2.x contrast ratio between two hex colors, 1..21. */
export function contrastRatio(a:string,b:string):number {
 const l1=relativeLuminance(a),l2=relativeLuminance(b);
 const [hi,lo]=l1>=l2?[l1,l2]:[l2,l1];
 return (hi+0.05)/(lo+0.05);
}

/**
 * Native validator for `ui` theme token maps: exact token coverage (no missing,
 * no unknown), hex colors only, and every documented pair above its floor.
 * Action ink on `--accent-fill` is white (#fff), checked at the body-text floor.
 */
export function nativeUiThemeValidator(tokens:Record<string,string>):boolean {
 const keys=Object.keys(tokens);
 if(keys.length!==UI_COLOR_TOKENS.length) return false;
 if(!UI_COLOR_TOKENS.every(t=>t in tokens)) return false;
 if(!keys.every(k=>(UI_COLOR_TOKENS as readonly string[]).includes(k))) return false;
 for(const t of UI_COLOR_TOKENS) if(!HEX.test(tokens[t]!)) return false;
 for(const [ink,surface,min] of CONTRAST_PAIRS) if(contrastRatio(tokens[ink]!,tokens[surface]!)<min) return false;
 return contrastRatio('#fff',tokens['--accent-fill']!)>=4.5;
}
