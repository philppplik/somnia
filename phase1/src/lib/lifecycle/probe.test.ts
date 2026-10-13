import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProbe, NATIVE_MEMORY_SAMPLE_COMMAND } from './probe';

test('desktop: a valid native sample wins over the JS heap', async () => {
  const probe = createMemoryProbe({
    isTauri: () => true,
    invokeNative: async (cmd) => {
      assert.equal(cmd, NATIVE_MEMORY_SAMPLE_COMMAND);
      return { usedBytes: 600, totalBytes: 1000 };
    },
    jsHeap: () => ({ usedBytes: 10, totalBytes: 100 }),
  });
  const sample = await probe.sample();
  assert.deepEqual(sample, { usedBytes: 600, totalBytes: 1000, source: 'tauri-native' });
});

test('a missing native command degrades to the JS heap and stops retrying', async () => {
  let calls = 0;
  const probe = createMemoryProbe({
    isTauri: () => true,
    invokeNative: async () => {
      calls += 1;
      throw new Error(`Command ${NATIVE_MEMORY_SAMPLE_COMMAND} not found`);
    },
    jsHeap: () => ({ usedBytes: 10, totalBytes: 100 }),
  });
  assert.deepEqual(await probe.sample(), { usedBytes: 10, totalBytes: 100, source: 'js-heap' });
  assert.deepEqual(await probe.sample(), { usedBytes: 10, totalBytes: 100, source: 'js-heap' });
  assert.equal(calls, 1);
});

test('a malformed native payload degrades to the JS heap', async () => {
  const probe = createMemoryProbe({
    isTauri: () => true,
    invokeNative: async () => ({ used: 1 }),
    jsHeap: () => ({ usedBytes: 5, totalBytes: 50 }),
  });
  assert.equal((await probe.sample())?.source, 'js-heap');
  const inverted = createMemoryProbe({
    isTauri: () => true,
    invokeNative: async () => ({ usedBytes: 200, totalBytes: 100 }),
    jsHeap: () => ({ usedBytes: 5, totalBytes: 50 }),
  });
  assert.equal((await inverted.sample())?.source, 'js-heap');
});

test('web without performance.memory reports no sample', async () => {
  const probe = createMemoryProbe({ isTauri: () => false, jsHeap: () => null });
  assert.equal(await probe.sample(), null);
});

test('web with performance.memory reports the heap ratio inputs', async () => {
  const probe = createMemoryProbe({
    isTauri: () => false,
    jsHeap: () => ({ usedBytes: 42, totalBytes: 2048 }),
  });
  assert.deepEqual(await probe.sample(), { usedBytes: 42, totalBytes: 2048, source: 'js-heap' });
});
