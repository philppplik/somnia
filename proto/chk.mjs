import { launch, sleep } from './lib.mjs';
const out = process.argv[2];
for (const [name, path, w, h] of [['app-d','',1440,900],['app-m','',390,800],['about-d','about/',1440,900],['about-m','about/',390,800]]) {
  const { p, close, url } = await launch(process.argv[3] || '/tmp/deploy/docs', w, h);
  await p.goto(url + path, { waitUntil: 'networkidle0' }); await sleep(1200);
  const info = await p.evaluate(() => ({ t: document.title, ovf: document.documentElement.scrollWidth > innerWidth + 1, imgs: [...document.images].filter(i => !i.naturalWidth).length }));
  console.log(name, JSON.stringify(info));
  await p.screenshot({ path: `${out}-${name}.png` }); await close();
}
