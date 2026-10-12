import {buildPreviewWithResources} from '../../../src/lib/livePreviewResources';
import {PreviewAssetCache} from '../../../src/lib/previewAssetCache';
import type {RenderFixture} from './corpus';
// The same resource and srcDoc renderer used by LivePreview.tsx, not raw setContent.
// Full application/control-hook mounting belongs to C3; this loop has no native WASM dependency.
const frame = document.querySelector<HTMLIFrameElement>('#preview')!;
declare global {
  interface Window {
    renderReference: (input: {fixture: RenderFixture; viewport: {width: number; height: number}; files: Record<string,string>; fontData: string}) => Promise<void>;
    referenceResult: {unloaded: string[]; external: string[]};
  }
}
window.renderReference = async ({fixture, viewport, files, fontData}) => {
  const result = await buildPreviewWithResources({source: null, files, active: fixture.entry,
    scripts: fixture.scripts, scrollY: 0, cache: new PreviewAssetCache(),
    fallbackLoader: async name => name === 'assets/DejaVuSans.ttf' ? {dataUrl: fontData}
      : name.endsWith('.svg') && files[name] ? {bytes: new TextEncoder().encode(files[name])} : null});
  window.referenceResult = {unloaded: result.unloaded, external: result.external};
  frame.width = String(viewport.width); frame.height = String(viewport.height);
  await new Promise<void>(resolve => {
    frame.addEventListener('load', () => resolve(), {once: true});
    frame.srcdoc = result.built.html;
  });
};
