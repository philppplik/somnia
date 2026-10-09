import {test, expect} from './fixtures';
import {readFileSync} from 'node:fs';
import path from 'node:path';

test.use({sample:false});
const fixture = (name:string) => readFileSync(path.join(import.meta.dirname,'assets/vector-studio',name),'utf8');
const rejected = ['reject-script.svg','reject-event.svg','reject-external-image.svg','reject-use.svg','reject-foreign-object.svg','reject-gradient.svg','reject-css.svg','reject-nested-svg.svg','reject-malformed.svg','reject-entity.svg','reject-path-tail.svg'];

test('Vector SVG boundary rejects active and unsupported corpus without network requests', async ({page}) => {
  await page.goto('/tests/assets/vector-studio/harness.html');
  const requests:string[] = [];
  page.on('request', request => {if (request.url().includes('vector-fixture.invalid')) requests.push(request.url());});
  const results = await page.evaluate(async (sources) => {
    const io = await import('/src/lib/vectorio/index.ts');
    return sources.map(source => {
      try {io.importSvg(source); return {rejected:false,diagnostics:[]};}
      catch (error) {return {rejected:error instanceof io.SvgImportError, diagnostics:(error as InstanceType<typeof io.SvgImportError>).diagnostics};}
    });
  },rejected.map(fixture));
  for (const result of results) {
    expect(result.rejected).toBe(true);
    expect(result.diagnostics.some(d => d.severity === 'error')).toBe(true);
  }
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {vectorFixtureExecuted?:boolean}).vectorFixtureExecuted)).toBeUndefined();
});

test('Vector SVG output renders a compound hole, hidden path and escaped Unicode labels', async ({page}) => {
  await page.goto('/tests/assets/vector-studio/harness.html');
  const output = await page.evaluate(async sources => {
    const io = await import('/src/lib/vectorio/index.ts');
    return sources.map(source => io.exportSvg(io.importSvg(source).doc));
  }, ['compound-hole.svg','styles-hidden.svg','unicode-names.svg'].map(fixture));
  // Generated markup only: imported source never enters the app DOM.
  await page.setContent('<main aria-label="Vector export proofs"></main>');
  await page.evaluate(exports => {
    const main = document.querySelector('main')!;
    for (const svg of exports) {
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.width = 200; img.height = 120; img.alt = 'Generated vector fixture'; main.append(img);
    }
  }, output);
  const images = page.getByAltText('Generated vector fixture');
  await expect(images).toHaveCount(3);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 200))).toBe(true);
  expect(output[0]).toContain('fill-rule="evenodd"');
  expect(output[1]).toContain('display="none"');
  expect(output[2]).toContain('Größe 日本語 🎨 &amp; layers');
  expect(output[2]).toContain('&quot;draft&quot; &lt;safe>');
  await page.screenshot({path:'test-results/vector-interchange-proof.png'});
});
