import {test,expect} from './fixtures';
test('live preview inlines project SVG images and keeps scripts out when off',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async()=>{const m=await import('/src/lib/livePreview.ts');
  const files={'index.html':'<html><head></head><body><img src="img/a.svg"><img src="https://x.test/b.png"><script>1</script></body></html>','img/a.svg':'<svg xmlns="http://www.w3.org/2000/svg"/>'};
  return {off:m.buildPreviewDoc(files,'index.html',false),on:m.buildPreviewDoc(files,'index.html',true)};});
 expect(out.off).toContain('data:image/svg+xml');expect(out.off).toContain('https://x.test/b.png');expect(out.off).not.toContain('<script>1');expect(out.off).toContain("script-src 'none'");
 expect(out.on).toContain("script-src 'unsafe-inline'");});
