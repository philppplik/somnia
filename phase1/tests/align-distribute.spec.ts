import {test, expect} from './fixtures';
// Note: the editor writes class rules (.element-xxxx), so fixtures style with classes. An id selector in the user's own CSS would out-rank them.
const page0 = '<!doctype html><html><head><title>t</title><style>body{margin:0}div{position:absolute;background:#ccc}.a{left:20px;top:20px;width:40px;height:30px}.b{left:120px;top:90px;width:60px;height:30px}.c{left:320px;top:40px;width:20px;height:30px}</style></head><body><div id="a" class="a">a</div><div id="b" class="b">b</div><div id="c" class="c">c</div></body></html>';
async function setup(page: any, html = page0) {
  await page.goto('/');
  await page.evaluate((s: string) => (window as any).__somnia.setSource('index.html', s), html);
  const frame = page.frameLocator('iframe[title="Sandboxed design preview"]');
  await expect(frame.locator('#a')).toHaveCount(1);
  return frame;
}
const left = (frame: any, id: string) => frame.locator(id).evaluate((e: HTMLElement) => e.getBoundingClientRect().x);
const top = (frame: any, id: string) => frame.locator(id).evaluate((e: HTMLElement) => e.getBoundingClientRect().y);
async function selectAll(frame: any) {
  await frame.locator('#a').click();
  await frame.locator('#b').click({modifiers: ['Shift']});
  await frame.locator('#c').click({modifiers: ['Shift']});
}
test('toolbar appears only with two or more selected', async ({page}) => {
  const frame = await setup(page);
  await frame.locator('#a').click();
  await expect(page.getByRole('toolbar', {name: 'Align and distribute'})).toHaveCount(0);
  await frame.locator('#b').click({modifiers: ['Shift']});
  await expect(page.getByRole('toolbar', {name: 'Align and distribute'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Distribute horizontally'})).toBeDisabled();
});
test('align left moves the others to the leftmost edge as one undo step', async ({page}) => {
  const frame = await setup(page);
  await selectAll(frame);
  const x0 = await left(frame, '#a');
  await page.getByRole('button', {name: 'Align left'}).click();
  await expect.poll(() => left(frame, '#b')).toBeCloseTo(x0, 0);
  expect(await left(frame, '#c')).toBeCloseTo(x0, 0);
  await page.keyboard.press('Control+z');
  await expect.poll(() => left(frame, '#b')).toBeGreaterThan(x0 + 50);
});
test('align bottom lines up bottom edges', async ({page}) => {
  const frame = await setup(page);
  await selectAll(frame);
  await page.getByRole('button', {name: 'Align bottom'}).click();
  const bottom = (id: string) => frame.locator(id).evaluate((e: HTMLElement) => e.getBoundingClientRect().bottom);
  await expect.poll(() => bottom('#a')).toBeCloseTo(await bottom('#b'), 0);
  expect(await bottom('#c')).toBeCloseTo(await bottom('#b'), 0);
});
test('distribute horizontally makes equal gaps and shows equal-gap guides', async ({page}) => {
  const frame = await setup(page);
  await selectAll(frame);
  await page.getByRole('button', {name: 'Align top'}).click(); // gap guides need the boxes to overlap on the cross axis
  await page.getByRole('button', {name: 'Distribute horizontally'}).click();
  // a: 20-60, c: 320-340, b width 60 -> gap = (320-60-60)/2 = 100 -> b.left = 160
  await expect.poll(() => left(frame, '#b')).toBeCloseTo(160, 0);
  const gaps = page.locator('[data-guide="gap"][data-gap="100"][data-equal="true"]');
  await expect(gaps.first()).toBeAttached();
  expect(await gaps.count()).toBeGreaterThanOrEqual(2);
});
test('static elements get position:relative offsets and keep their flow slot', async ({page}) => {
  const frame = await setup(page, '<!doctype html><html><head><title>t</title><style>body{margin:0} p{margin:0;width:50px;height:20px;background:#ccc}</style></head><body><p id="a">a</p><p id="b" style="margin-left:100px">b</p></body></html>');
  await frame.locator('#a').click();
  await frame.locator('#b').click({modifiers: ['Shift']});
  await page.getByRole('button', {name: 'Align left'}).click();
  await expect.poll(() => left(frame, '#b')).toBeCloseTo(0, 0);
  expect(await top(frame, '#b')).toBeCloseTo(20, 0);
});
test('locked elements are not moved', async ({page}) => {
  const frame = await setup(page);
  await frame.locator('#b').click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Lock layer'}).click();
  await selectAll(frame);
  const b0 = await left(frame, '#b');
  await page.getByRole('button', {name: 'Align left'}).click();
  await expect.poll(() => left(frame, '#c')).toBeCloseTo(await left(frame, '#a'), 0);
  expect(await left(frame, '#b')).toBeCloseTo(b0, 0);
});
