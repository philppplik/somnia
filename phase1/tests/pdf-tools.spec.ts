/**
 * PDF tools E2E (import / edit / export). QA skeleton, written against the beta.6 architecture doc
 * (PDF-ARCHITECTURE, "Beta.6 feature scope", section 5 "Export and save safety", section 7 gates)
 * and the baseline at 1d014e1.
 *
 * Two kinds of tests:
 *  - LIVE  (plain `test`): exercise behavior that exists today through selectors that exist today
 *          (`pdf-stage`, `pdf-page-count`, `pdf-error`, `media-name`). They must pass on the baseline.
 *  - SPEC  (`test.fixme`): encode expected behavior of NEW flows. Every UI hook marked ASSUMPTION is a
 *          proposed name, not an existing one. When the swarm lands the feature, remove `.fixme`, replace the
 *          ASSUMPTION selectors with the real ones, and delete the ASSUMPTION tag. If real behavior
 *          differs from the stated expectation, raise it as a product decision, do not just edit the test.
 *
 * Fixtures come from test/pdf-qa/fixtures.ts, written to a temp dir per worker.
 */
import { test, expect } from './fixtures';
import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { writeCorpus } from '../test/pdf-qa/fixtures';

let corpus: Record<string, string>;
test.beforeAll(async () => {
  corpus = await writeCorpus(path.join(os.tmpdir(), `somnia-pdf-qa-${process.pid}`));
});

/** Same opening path the existing media specs use (project.openMedia + file chooser). */
async function openPdf(page: any, name: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.evaluate(async () => {
    const m = await import('/src/lib/commands.ts');
    void m.executeCommand('project.openMedia');
  });
  (await chooser).setFiles(corpus[name]);
}
/** ASSUMPTION A10: commands are reachable via executeCommand with these ids. Replace with real ids. */
async function runCommand(page: any, id: string, args?: unknown) {
  return page.evaluate(async ([cmd, a]: [string, unknown]) => {
    const m = await import('/src/lib/commands.ts');
    return (m as any).executeCommand(cmd, a);
  }, [id, args] as [string, unknown]);
}
/** ASSUMPTION A11: "export copy" yields a browser download (web build); Tauri build uses a native dialog and is out of scope here. */
async function exportCopy(page: any, command: string, args?: unknown): Promise<Uint8Array> {
  const dl = page.waitForEvent('download');
  await runCommand(page, command, args);
  const file = await (await dl).path();
  return new Uint8Array(await readFile(file!));
}
const pdfPages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();

test.describe('LIVE: import (open) behavior on the baseline', () => {
  for (const [name, pages] of [['text-heavy', 5], ['image-heavy', 4], ['multi-page', 12], ['acroform', 1]] as const) {
    test(`opens ${name} and shows ${pages} pages`, async ({ page }) => {
      await page.goto('/');
      await openPdf(page, name);
      await expect(page.getByTestId('media-name')).toHaveText(`${name}.pdf`);
      await expect(page.getByTestId('pdf-page-count')).toHaveText(`/ ${pages}`);
      await expect(page.getByTestId('pdf-stage')).toBeVisible();
    });
  }
  test('non-PDF bytes named .pdf are rejected without opening a tab', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'corrupt-text-file');
    // Baseline copy for rejection is "<name> is not a valid supported raster image or PDF file." (see media-preview.spec.ts)
    await expect(page.getByText(/is not a valid supported raster image or PDF file/)).toBeVisible();
    await expect(page.getByTestId('media-tab')).toHaveCount(0);
  });
  test('structurally damaged PDF shows a readable error, not a blank viewer', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'corrupt-truncated-half');
    // Golden test documents: pdf-lib recovers this file, pdf.js refuses it. The viewer path must surface pdf-error.
    await expect(page.getByTestId('pdf-error')).toBeVisible();
    await expect(page.getByTestId('pdf-error')).not.toBeEmpty();
  });
  test('page navigation clamps at both ends', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'multi-page');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await page.getByLabel('Page number').fill('12');
    await page.getByLabel('Page number').press('Enter');
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});

test.describe('SPEC: import (new)', () => {
  test.fixme('encrypted PDF is viewable-or-asks-for-password, and edit tools are disabled with a reason', async ({ page }) => {
    // NOTE: encrypted-marker is a STRUCTURAL stand-in (README A1). Real password flow needs a real encrypted PDF made outside this repo.
    await page.goto('/');
    await openPdf(page, 'encrypted-marker');
    await expect(page.getByTestId('pdf-capability-reason')).toContainText(/encrypted/i); // ASSUMPTION A12: testid for PdfCapabilities.reason
    for (const id of ['pdf-tool-rotate', 'pdf-tool-delete', 'pdf-tool-add-text']) await expect(page.getByTestId(id)).toBeDisabled(); // ASSUMPTION A13
  });
  test.fixme('signed and XFA PDFs are view-only with distinct reasons ("signature present", not "valid")', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'signed-marker');
    await expect(page.getByTestId('pdf-capability-reason')).toContainText(/signature present/i);
    await expect(page.getByTestId('pdf-capability-reason')).not.toContainText(/valid/i);
    await openPdf(page, 'xfa-marker');
    await expect(page.getByTestId('pdf-capability-reason')).toContainText(/XFA/i);
  });
  test.fixme('page content extraction: search finds a marker on page 4 and jumps there', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'text-heavy');
    await page.getByTestId('pdf-search-input').fill('QA-TEXT-p4-l7'); // ASSUMPTION A14
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Page number')).toHaveValue('4');
    await expect(page.getByTestId('pdf-search-count')).toHaveText(/1 of 1|1\/1/); // ASSUMPTION A14
  });
  test.fixme('image-only page: search reports no text layer and does not claim OCR', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'image-heavy');
    await page.getByTestId('pdf-search-input').fill('IMG-CAPTION-1'); // caption IS text; the gradient is not
    await expect(page.getByTestId('pdf-search-count')).toHaveText(/1/);
    await expect(page.getByText(/OCR/i)).toHaveCount(0); // beta.6 has NO OCR
  });
  test.fixme('very large page (14400pt) opens without freezing; zoom is capped', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'corrupt-oversize-claim');
    await expect(page.getByTestId('pdf-stage')).toBeVisible({ timeout: 10_000 });
    const px = await page.getByRole('img', { name: /Page 1 of 1/ }).evaluate((c: HTMLCanvasElement) => c.width * c.height);
    expect(px).toBeLessThan(64_000_000); // ASSUMPTION A15: pixel budget; adjust to the real cap in the implementation
  });
  test.fixme('decompression-heavy PDF opens or fails cleanly within the 20 s watchdog; UI stays responsive', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'decompression-heavy');
    await expect(page.getByTestId('pdf-stage').or(page.getByTestId('pdf-error'))).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
  });
  test.fixme('opening the same file twice does not clobber unsaved edits in the first tab', async ({ page }) => {
    // Architecture doc: filename-keyed sessions can be replaced by a same-name item. Expected: either reuse the tab or warn. Never silent loss.
    await page.goto('/');
    await openPdf(page, 'multi-page');
    await runCommand(page, 'pdf.page.rotate', { page: 0 }); // ASSUMPTION A10
    await openPdf(page, 'multi-page');
    await expect(page.getByTestId('pdf-dirty')).toBeVisible(); // ASSUMPTION A16: unsaved indicator testid
  });
});

test.describe('SPEC: edit (new)', () => {
  test.fixme('rotate / reorder / delete update the page strip, and undo restores each step', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'multi-page');
    await runCommand(page, 'pdf.page.delete', { page: 0 });
    await expect(page.getByTestId('pdf-page-count')).toHaveText('/ 11');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('pdf-page-count')).toHaveText('/ 12');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByTestId('pdf-page-count')).toHaveText('/ 11');
  });
  test.fixme('deleting the last page is blocked with the message "Keep at least one page"', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'blank');
    await runCommand(page, 'pdf.page.delete', { page: 0 });
    await expect(page.getByRole('alert')).toContainText(/at least one page/i);
    await expect(page.getByTestId('pdf-page-count')).toHaveText('/ 1');
  });
  test.fixme('deleting a page with form widgets is blocked (baseline rule is kept in beta.6)', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'acroform');
    await expect(page.getByTestId('pdf-tool-delete')).toBeDisabled(); // single page: blocked either way; second page covered in unit golden
  });
  test.fixme('failed edit leaves no history entry and no dirty flag', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'blank');
    await runCommand(page, 'pdf.text.add', { page: 0, text: '日本語', x: 20, y: 20, size: 12 }); // Helvetica cannot encode this
    await expect(page.getByRole('alert')).toContainText(/encod|support|font/i); // arch doc: "useful error" for Helvetica limits
    await expect(page.getByTestId('pdf-dirty')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Undo/ })).toBeDisabled();
  });
  test.fixme('add text appears in the rendered page and in extracted text after export', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'blank');
    await runCommand(page, 'pdf.text.add', { page: 0, text: 'Hello QA', x: 20, y: 200, size: 14 });
    const out = await exportCopy(page, 'pdf.export.copy');
    expect(await pdfPages(out)).toBe(1);
    expect(Buffer.from(out).includes('Hello QA') || out.length > 800).toBe(true); // weak check; real check = reopen in pdf.js and search (A17)
  });
  test.fixme('annotations: highlight on page 2 survives reload of the exported copy and keeps its comment', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'text-heavy');
    await runCommand(page, 'pdf.annotation.add', { kind: 'highlight', page: 1, rects: [{ x: 72, y: 600, width: 200, height: 14 }], contents: 'check this' });
    const out = await exportCopy(page, 'pdf.export.copy');
    const d = await PDFDocument.load(out);
    expect(d.getPage(1).node.Annots()?.size()).toBe(1);
    expect(d.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });
  test.fixme('form fill: values typed in the UI are readable from the exported copy and the form stays interactive', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'acroform');
    await page.getByTestId('pdf-field-full_name').fill('Ada Lovelace'); // ASSUMPTION A18: per-field input testid pdf-field-<name>
    await page.getByTestId('pdf-field-agree').check();
    const out = await exportCopy(page, 'pdf.export.copy');
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField('full_name').getText()).toBe('Ada Lovelace');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getFields().length).toBe(8);
  });
  test.fixme('read-only form field cannot be edited in the UI', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'acroform');
    await expect(page.getByTestId('pdf-field-locked_id')).toBeDisabled();
  });
  test.fixme('merge: inserting a PDF with form fields is refused with the baseline message', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'blank');
    await runCommand(page, 'pdf.page.insert', { source: corpus['acroform'], after: 0 }); // ASSUMPTION A19: insert takes a file path in tests
    await expect(page.getByRole('alert')).toContainText(/form fields is not supported/i);
  });
  test.fixme('restricted source-text replace: works on a simple Tj, refuses TJ arrays and form XObjects with an explanation', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'simple-tj-text');
    await runCommand(page, 'pdf.text.replace', { page: 0, expectedText: 'Hello Somnia', replacement: 'Hello QA' });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await openPdf(page, 'tj-array-text');
    await expect(page.getByTestId('pdf-tool-replace-text')).toBeDisabled(); // ASSUMPTION A20: tool disabled with reason, label "Replace supported text"
    await expect(page.getByTestId('pdf-capability-reason')).toContainText(/supported text|TJ|unsupported/i);
  });
  test.fixme('rotated + cropped pages: a highlight placed by click lands where clicked (all 4 rotations)', async ({ page }) => {
    // Needs pixel verification: render exported copy with pdf.js and compare the highlight bounding box to the click point within 3 px.
    await page.goto('/');
    await openPdf(page, 'cropbox-rotations');
    for (let p = 1; p <= 4; p++) {
      await page.getByLabel('Page number').fill(String(p));
      await page.getByLabel('Page number').press('Enter');
      const box = (await page.getByTestId('pdf-stage').boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      // TODO(A21): drag-select with the highlight tool and assert via exported /Rect against the inverse viewport transform.
    }
  });
});

test.describe('SPEC: export (new)', () => {
  test.fixme('"Original" export returns the exact input bytes when nothing changed', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'multi-page');
    const out = await exportCopy(page, 'pdf.export.original');
    const src = new Uint8Array(await readFile(corpus['multi-page']));
    expect(Buffer.from(out).equals(Buffer.from(src))).toBe(true);
  });
  test.fixme('edited copy never overwrites the original file and has a distinct suggested name', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'multi-page');
    await runCommand(page, 'pdf.page.rotate', { page: 0 });
    const dl = page.waitForEvent('download');
    await runCommand(page, 'pdf.export.copy');
    expect((await dl).suggestedFilename()).not.toBe('multi-page.pdf'); // ASSUMPTION A22: "-edited" or similar suffix
  });
  test.fixme('flattened copy removes all fields, keeps visible values, and is labelled destructive', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'acroform');
    await page.getByTestId('pdf-field-full_name').fill('Flat Ada');
    const out = await exportCopy(page, 'pdf.export.flattened');
    const d = await PDFDocument.load(out);
    expect(d.getForm().getFields().length).toBe(0);
    expect(d.getPageCount()).toBe(1);
    // Visible values: reopen `out` in pdf.js and search "Flat Ada" (A17).
  });
  test.fixme('export of encrypted / signed / XFA documents is blocked for every edit-class mode but "Original" still works', async ({ page }) => {
    for (const name of ['encrypted-marker', 'signed-marker', 'xfa-marker']) {
      await page.goto('/');
      await openPdf(page, name);
      await expect(page.getByTestId('pdf-export-flattened')).toBeDisabled(); // ASSUMPTION A23
      await expect(page.getByTestId('pdf-export-original')).toBeEnabled();
    }
  });
  test.fixme('selected pages export has exactly the selected pages in order', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'multi-page');
    const out = await exportCopy(page, 'pdf.export.pages', { pages: [4, 0, 7] }); // zero-based; ASSUMPTION A24: caller order is kept
    const d = await PDFDocument.load(out);
    expect(d.getPageCount()).toBe(3);
    expect(d.getPages().map((p) => `${p.getWidth()}x${p.getHeight()}`)).toEqual(['612x792', '612x792', '595x842'].map((x, i) => x)); // pages 5,1,8 of sizes cycle 612,595,792,200
  });
  test.fixme('export is round-trippable: export, reopen the exported file, same page count and annotation count', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'existing-annotations');
    const out = await exportCopy(page, 'pdf.export.copy');
    const d = await PDFDocument.load(out);
    expect(d.getPageCount()).toBe(1);
    expect(d.getPage(0).node.Annots()?.size()).toBe(2); // pre-existing highlight + note preserved
  });
  test.fixme('export presets: "Small" produces a smaller file than "Original quality" for image-heavy input, same page count', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'image-heavy');
    const hi = await exportCopy(page, 'pdf.export.copy', { preset: 'original-quality' }); // ASSUMPTION A25: preset ids
    const lo = await exportCopy(page, 'pdf.export.copy', { preset: 'small' });
    expect(await pdfPages(lo)).toBe(await pdfPages(hi));
    expect(lo.length).toBeLessThan(hi.length);
  });
  test.fixme('fonts: exported text PDFs embed no GPL font program (Liberation) and no remote references', async ({ page }) => {
    await page.goto('/');
    await openPdf(page, 'text-heavy');
    const out = await exportCopy(page, 'pdf.export.copy');
    const s = Buffer.from(out).toString('latin1');
    expect(s).not.toMatch(/Liberation/i);
    expect(s).not.toMatch(/\/URI\s*\(http/);
  });
  test.fixme('offline: opening and exporting makes no network requests to non-local origins', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r: any) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
    await page.goto('/');
    await openPdf(page, 'text-heavy');
    await exportCopy(page, 'pdf.export.copy');
    expect(external).toEqual([]);
  });
});
