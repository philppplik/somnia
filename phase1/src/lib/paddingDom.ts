import {SIDES,unsafeSides,type Pad,type Side} from './paddingEdit';
export interface BoxInfo { pad: Pad; border: Pad; unsafe: Set<Side> }
const px = (v: string) => parseFloat(v) || 0;
/** Declarations (property, value) of padding / padding-* from every rule matching the element, plus its inline style. */
export function collectPaddingDecls(el: Element): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const win = el.ownerDocument.defaultView;
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const r = rule as CSSStyleRule & CSSMediaRule;
      if (r.cssRules && !r.selectorText) {
        if (r.media && win && !win.matchMedia(r.media.mediaText).matches) continue;
        visit(r.cssRules);
      } else if (r.selectorText && r.style) {
        let hit = false;
        try { hit = el.matches(r.selectorText); } catch { /* unsupported selector */ }
        if (!hit) continue;
        for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; if (p === 'padding' || p.startsWith('padding-')) out.push([p, r.style.getPropertyValue(p)]); }
        const sh = r.style.getPropertyValue('padding'); if (sh) out.push(['padding', sh]);
      }
    }
  };
  for (const sheet of Array.from(el.ownerDocument.styleSheets)) { try { visit(sheet.cssRules); } catch { /* cross-origin sheet */ } }
  const inline = (el as HTMLElement).style;
  if (inline) for (let i = 0; i < inline.length; i++) { const p = inline[i]; if (p === 'padding' || p.startsWith('padding-')) out.push([p, inline.getPropertyValue(p)]); }
  return out;
}
export function readPadding(win: Window, el: Element): Pad {
  const cs = win.getComputedStyle(el);
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}
export function readBox(win: Window, el: Element): BoxInfo {
  const cs = win.getComputedStyle(el);
  const pad = readPadding(win, el);
  const border = { top: px(cs.borderTopWidth), right: px(cs.borderRightWidth), bottom: px(cs.borderBottomWidth), left: px(cs.borderLeftWidth) };
  return { pad, border, unsafe: unsafeSides(collectPaddingDecls(el)) };
}
export const emptyPad = (): Pad => Object.fromEntries(SIDES.map(s => [s, 0])) as Pad;
