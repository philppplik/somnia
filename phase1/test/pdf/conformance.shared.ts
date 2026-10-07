import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikePdf, makeMultiPagePdf, makeTextPdf } from './fixtures';
import { OP_TYPE_PATTERN, PDFLIB_DIR, SKIP_REASON, areaPrefix, registerModule, type PdfModuleName } from './harness';

/**
 * Registers the contract tests shared by all four modules. Area-specific
 * suites call this and then add their own `test.todo` / real cases.
 */
export function sharedConformance(name: PdfModuleName): void {
  const skip = PDFLIB_DIR ? false : SKIP_REASON;

  test(`${name}: registers only pdf-* ops with its area prefix, and disposes cleanly`, { skip }, async () => {
    const { registry, dispose } = await registerModule(name);
    assert.ok(registry.handlers.size > 0, 'module registered no handlers');
    for (const h of registry.handlers.values()) {
      assert.match(h.type, OP_TYPE_PATTERN, `bad op name ${h.type}`);
      assert.ok(h.type.startsWith(areaPrefix(name)), `${h.type} must start with ${areaPrefix(name)}`);
      assert.ok(Number.isInteger(h.version) && h.version >= 1, `${h.type} needs integer version >= 1`);
      assert.equal(typeof h.apply, 'function');
    }
    dispose();
    assert.equal(registry.handlers.size, 0, 'disposer must remove every registration it made');
  });

  test(`${name}: registering twice on one registry throws and leaves it unchanged`, { skip }, async () => {
    const { registry } = await registerModule(name);
    const before = registry.handlers.size;
    const mod = await import('./harness').then((h) => h.loadPdfModule(name));
    const fn = mod[(await import('./harness')).REGISTER_EXPORT[name]] as (r: unknown) => () => void;
    assert.throws(() => fn(registry));
    assert.equal(registry.handlers.size, before, 'registration must be transactional');
  });

  test(`${name}: handlers never mutate their input bytes`, { skip }, async () => {
    const { registry } = await registerModule(name);
    const input = name === 'pdforganize' ? await makeMultiPagePdf(3) : await makeTextPdf();
    const snapshot = input.slice();
    for (const h of registry.handlers.values()) {
      try {
        // Empty params are expected to be rejected; only the no-mutation rule matters here.
        await h.apply(input, {}, {});
      } catch { /* invalid params are allowed to throw */ }
      assert.deepEqual(input, snapshot, `${h.type} mutated its input`);
    }
    assert.ok(looksLikePdf(input));
  });
}
