import test from 'node:test';
import assert from 'node:assert/strict';
import { installStudioLifecycle, getStudioLifecycle } from './integration';
import { JobScheduler } from '../jobs/scheduler';
import { LOW_PROFILE, NORMAL_PROFILE } from './budgets';
import { LIFECYCLE_SETTINGS_KEY } from './settings';

const tick = () => new Promise<void>(r => setImmediate(r));

test('installation connects leases, pressure, profiles and in-flight probe cleanup', async () => {
 const scheduler = new JobScheduler();
 const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
 let setting = JSON.stringify({ enabled: true, profile: 'low' });
 Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
   getItem: (key: string) => key === LIFECYCLE_SETTINGS_KEY ? setting : null,
 } });
 let notify = () => {};
 let finish: (value: null) => void = () => {};
 let samples = 0;
 const dispose = installStudioLifecycle({
   scheduler, getActiveStudio: () => 'documents', resolveAdapter: () => undefined,
   subscribe(fn) { notify = fn; return () => { notify = () => {}; }; },
   probe: { sample() { samples++; return new Promise(resolve => { finish = resolve; }); } },
   pressureIntervalMs: 1,
 });
 try {
   assert.ok(getStudioLifecycle());
   await assert.rejects(scheduler.acquire({ kind: 'export', priority: 2, estimatedBytes: LOW_PROFILE.buckets.jobs + 1 }));
   const a = await scheduler.acquire({ kind: 'export', priority: 2 });
   const b = scheduler.acquire({ kind: 'export', priority: 2 });
   assert.equal(scheduler.list().filter(r => r.state === 'queued').length, 1);
   setting = JSON.stringify({ enabled: true, profile: 'normal' });notify();
   const second = await b;
   a.release();second.release();
   const large = await scheduler.acquire({ kind: 'export', priority: 2, estimatedBytes: NORMAL_PROFILE.buckets.jobs });large.release();
   await new Promise(r => setTimeout(r, 10));assert.equal(samples, 1, 'samples must not overlap');
   dispose();assert.equal(getStudioLifecycle(), null);
   scheduler.setPressure('critical');finish(null);await tick();
   const pending = scheduler.acquire({ kind: 'maintenance', priority: 3 });
   assert.equal(scheduler.list().find(r => r.kind === 'maintenance')?.state, 'queued', 'late sample cannot reset pressure');
   scheduler.setPressure('normal');(await pending).release();
 } finally {
   dispose();
   if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
   else Reflect.deleteProperty(globalThis, 'localStorage');
 }
});

test('native or heap pressure reaches scheduler while P0 continues', async () => {
 const scheduler = new JobScheduler();
 const levels: string[] = [];
 const dispose = installStudioLifecycle({
   scheduler, getActiveStudio: () => 'documents', resolveAdapter: () => undefined,
   subscribe: () => () => {}, onPressure: level => levels.push(level),
   probe: { sample: async () => ({ usedBytes: 96, totalBytes: 100, source: 'tauri-native' }) },
 });
 try {
   await tick();assert.deepEqual(levels, ['critical']);
   const queued = scheduler.acquire({ kind: 'export', priority: 2 });
   assert.equal(scheduler.list().find(r => r.kind === 'export')?.state, 'queued');
   (await scheduler.acquire({ kind: 'save', priority: 0 })).release();
   dispose();(await queued).release();
 } finally { dispose(); }
});
