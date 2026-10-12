import {buildPreviewWithResources} from '../../../src/lib/livePreviewResources';
import {PreviewAssetCache} from '../../../src/lib/previewAssetCache';
import {elementOverlayBox} from '../../../src/lib/overlayGeometry';
import type {RenderFixture} from './corpus';
// The same resource and srcDoc renderer used by LivePreview.tsx, not raw setContent.
// Full application/control-hook mounting belongs to C3; this loop has no native WASM dependency.
const frame = document.querySelector<HTMLIFrameElement>('#preview')!;
export interface OverlayRow {label: string; overlay: number[]; expected: number[]}
declare global {
  interface Window {
    renderReference: (input: {fixture: RenderFixture; viewport: {width: number; height: number}; files: Record<string,string>; fontData: string; inspect?: boolean}) => Promise<void>;
    overlayOracle: (scale: number) => OverlayRow[];
    referenceResult: {unloaded: string[]; external: string[]};
  }
}
window.renderReference = async ({fixture, viewport, files, fontData, inspect}) => {
  const result = await buildPreviewWithResources({source: null, files, active: fixture.entry,
    scripts: fixture.scripts, scrollY: 0, cache: new PreviewAssetCache(),
    fallbackLoader: async name => name === 'assets/DejaVuSans.ttf' ? {dataUrl: fontData}
      : name.endsWith('.svg') && files[name] ? {bytes: new TextEncoder().encode(files[name])} : null});
  window.referenceResult = {unloaded: result.unloaded, external: result.external};
  // Overlay oracle reads the frame DOM, like DesignCanvas (allow-same-origin); golden runs keep the script-only sandbox.
  frame.setAttribute('sandbox', inspect ? 'allow-scripts allow-same-origin' : 'allow-scripts');
  frame.width = String(viewport.width); frame.height = String(viewport.height);
  await new Promise<void>(resolve => {
    frame.addEventListener('load', () => resolve(), {once: true});
    frame.srcdoc = result.built.html;
  });
};

// Overlay oracle: mirrors DesignCanvas (frame inside a scaled wrapper, overlay boxes placed at
// elementOverlayBox() coordinates in that same wrapper) and reports real screen rects.
window.overlayOracle = scale => {
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const layer = stage.querySelector<HTMLElement>('#layer')!; layer.replaceChildren();
  stage.style.cssText = `position:relative;width:${frame.width}px;height:${frame.height}px;transform:scale(${scale});transform-origin:top left`;
  layer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  const doc = frame.contentDocument!;
  const els = Array.from(doc.body.querySelectorAll('*')).filter(e => !/^(SCRIPT|STYLE|LINK|META|TITLE|HEAD|BR|TEMPLATE)$/i.test(e.tagName)).slice(0, 80);
  const frameRect = frame.getBoundingClientRect();
  const k = frameRect.width / frame.clientWidth; // screen px per frame px, derived from the frame itself
  const rows: OverlayRow[] = [];
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const box = elementOverlayBox(el);
    const o = document.createElement('div'); o.className = 'selection-box'; o.dataset.i = String(i);
    o.style.cssText = `position:absolute;box-sizing:border-box;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
    layer.append(o);
    const rect = o.getBoundingClientRect();
    rows.push({label: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${i}]`,
      overlay: [rect.x, rect.y, rect.width, rect.height],
      expected: [frameRect.x + r.x * k, frameRect.y + r.y * k, r.width * k, r.height * k]});
  });
  return rows;
};
