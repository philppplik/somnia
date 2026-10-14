import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioLifecycleManager, WARM_GRACE_MS, PIN_RECHECK_MS, type LifecycleClock } from './manager';
import { LifecycleTelemetry } from './telemetry';
import { CheckpointStore } from './checkpoints';
import { NORMAL_PROFILE, LOW_PROFILE, type ResourceBudgetProfile } from './budgets';
import type { StudioLifecycleAdapter, StudioSnapshot } from './types';

class FakeClock implements LifecycleClock {
  nowMs = 1_000_000;
  private timers: { id: number; fn: () => void; at: number }[] = [];
  private nextId = 1;
  now(): number { return this.nowMs; }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.push({ id, fn, at: this.nowMs + ms });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }
  advance(ms: number): void {
    const until = this.nowMs + ms;
    for (;;) {
      const next = this.timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.nowMs = next.at;
      this.timers = this.timers.filter((t) => t !== next);
      next.fn();
    }
    this.nowMs = until;
  }
  pending(): number { return this.timers.length; }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

interface FakeAdapter {
  adapter: StudioLifecycleAdapter;
  log: string[];
  setBytes(n: number): void;
  setPins(pins: string[]): void;
  setDirty(dirty: boolean): void;
  failSnapshot(mode: 'null' | 'throw' | null): void;
  restored: StudioSnapshot | null;
}

const fakeAdapter = (id: string): FakeAdapter => {
  const log: string[] = [];
  let bytes = 100;
  let pins: string[] = [];
  let dirty = false;
  let fail: 'null' | 'throw' | null = null;
  const fake: FakeAdapter = {
    log,
    restored: null,
    setBytes(n) { bytes = n; },
    setPins(p) { pins = p; },
    setDirty(d) { dirty = d; },
    failSnapshot(mode) { fail = mode; },
    adapter: {
      estimateBytes: () => bytes,
      resourceIds: () => [`studio:${id}`],
      pinReasons: () => pins,
      hasUnsavedChanges: () => dirty,
      snapshot: async () => {
        log.push('snapshot');
        if (fail === 'null') return null;
        if (fail === 'throw') throw new Error('snapshot boom');
        return { studioId: id, schemaVersion: 1, revision: 1, capturedAt: 0, bytesEstimate: 10, checksum: 'ok', payload: { id } };
      },
      suspend: async () => { log.push('suspend'); },
      resume: async (snapshot) => { log.push('resume'); fake.restored = snapshot; },
      dispose: async () => { log.push('dispose'); },
    },
  };
  return fake;
};

interface Harness {
  manager: StudioLifecycleManager;
  clock: FakeClock;
  telemetry: LifecycleTelemetry;
  adapters: Map<string, FakeAdapter>;
  problems: string[];
  setEnabled(on: boolean): void;
  setProfile(p: ResourceBudgetProfile): void;
}

const harness = (options: { enabled?: boolean; profile?: ResourceBudgetProfile; checkpoints?: CheckpointStore } = {}): Harness => {
  const clock = new FakeClock();
  const telemetry = new LifecycleTelemetry({ now: () => clock.now() });
  const adapters = new Map<string, FakeAdapter>();
  const problems: string[] = [];
  let enabled = options.enabled ?? true;
  let profile = options.profile ?? NORMAL_PROFILE;
  const manager = new StudioLifecycleManager({
    resolveAdapter: (id) => {
      if (id === 'naked') return undefined;
      const fake = adapters.get(id) ?? fakeAdapter(id);
      adapters.set(id, fake);
      return fake.adapter;
    },
    isEnabled: () => enabled,
    profile: () => profile,
    telemetry,
    checkpoints: options.checkpoints,
    clock,
    warmGraceMs: WARM_GRACE_MS,
    onProblem: (m) => problems.push(m),
  });
  return {
    manager, clock, telemetry, adapters, problems,
    setEnabled: (on) => { enabled = on; },
    setProfile: (p) => { profile = p; },
  };
};

test('first activation opens a studio cold and records the transition', async () => {
  const h = harness();
  await h.manager.activate('code');
  assert.equal(h.manager.stateOf('code'), 'active');
  assert.equal(h.manager.activeId(), 'code');
  const t = h.telemetry.events().find((e) => e.type === 'transition' && e.studioId === 'code');
  assert.equal(t?.from, 'evicted');
  assert.equal(t?.to, 'active');
  assert.equal(t?.reason, 'cold-open');
});

test('switching warms the previous studio and keeps at most one warm', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  assert.equal(h.manager.stateOf('a'), 'warm');
  assert.equal(h.manager.stateOf('b'), 'active');
  await h.manager.activate('c');
  await flush();
  assert.equal(h.manager.stateOf('b'), 'warm');
  assert.equal(h.manager.stateOf('c'), 'active');
  // The warm cap suspended a immediately (grace applies only to the newest warm studio).
  assert.equal(h.manager.stateOf('a'), 'suspended');
  assert.deepEqual(h.adapters.get('a')?.log, ['snapshot', 'suspend']);
});

test('warm grace suspends after 30 seconds and resume restores from the checkpoint', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  assert.equal(h.manager.stateOf('a'), 'warm');
  h.clock.advance(WARM_GRACE_MS - 1);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  h.clock.advance(1);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
  await h.manager.activate('a');
  assert.equal(h.manager.stateOf('a'), 'active');
  assert.equal(h.adapters.get('a')?.restored?.payload && true, true);
  assert.deepEqual(h.adapters.get('a')?.log, ['snapshot', 'suspend', 'resume']);
});

test('warm return before the grace ends skips snapshot and resume', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.clock.advance(WARM_GRACE_MS / 2);
  await h.manager.activate('a');
  assert.equal(h.manager.stateOf('a'), 'active');
  assert.deepEqual(h.adapters.get('a')?.log ?? [], []);
});

test('pin reasons block suspension and the recheck settles once pins clear', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  const a = h.adapters.get('a')!;
  a.setPins(['presentation']);
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  assert.deepEqual(h.manager.pinReasonsOf('a'), ['presentation']);
  assert.ok(h.telemetry.events().some((e) => e.type === 'pin' && e.studioId === 'a'));
  a.setPins([]);
  h.clock.advance(PIN_RECHECK_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
});

test('an active job lease blocks suspension until the provider clears', async () => {
  const h = harness();
  let leased = true;
  const unregister = h.manager.registerJobLeaseProvider((resourceId) => leased && resourceId === 'studio:a');
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  assert.ok(h.manager.pinReasonsOf('a').some((r) => r.startsWith('job-lease:')));
  leased = false;
  h.clock.advance(PIN_RECHECK_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
  unregister();
});

test('a null snapshot pins the studio warm and reports the failure', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.adapters.get('a')!.failSnapshot('null');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  assert.deepEqual(h.manager.pinReasonsOf('a'), ['snapshot-failed']);
  assert.equal(h.problems.length, 1);
  assert.ok(h.telemetry.events().some((e) => e.type === 'snapshot-failed'));
});

test('a throwing snapshot keeps the studio warm and is reported', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.adapters.get('a')!.failSnapshot('throw');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  assert.equal(h.manager.lastErrorOf('a'), 'snapshot boom');
  assert.equal(h.problems.length, 1);
});

test('checkpoint budget refusal keeps the studio warm without dropping data', async () => {
  const h = harness({ checkpoints: new CheckpointStore(1) });
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  assert.deepEqual(h.manager.pinReasonsOf('a'), ['checkpoint-budget']);
  assert.ok(h.telemetry.events().some((e) => e.type === 'checkpoint-refused'));
});

test('eviction is refused while unsaved edits exist and disposes clean studios', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
  h.adapters.get('a')!.setDirty(true);
  assert.equal(await h.manager.evict('a', 'test'), false);
  assert.ok(h.telemetry.events().some((e) => e.type === 'evict-refused'));
  h.adapters.get('a')!.setDirty(false);
  assert.equal(await h.manager.evict('a', 'test'), true);
  assert.equal(h.manager.stateOf('a'), 'evicted');
  assert.deepEqual(h.adapters.get('a')?.log, ['snapshot', 'suspend', 'dispose']);
});

test('a studio without lifecycle hooks leaves the warm state immediately', async () => {
  const h = harness();
  await h.manager.activate('naked');
  await h.manager.activate('a');
  await flush();
  assert.equal(h.manager.stateOf('naked'), 'evicted');
});

test('low-memory profile has no warm slot: the previous studio suspends at once', async () => {
  const h = harness({ profile: LOW_PROFILE });
  await h.manager.activate('a');
  await h.manager.activate('b');
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
  assert.equal(h.manager.stateOf('b'), 'active');
});

test('disabled lifecycle records the active studio without transitions', async () => {
  const h = harness({ enabled: false });
  await h.manager.activate('a');
  await h.manager.activate('b');
  assert.equal(h.manager.activeId(), 'b');
  assert.equal(h.manager.stateOf('a'), 'cold');
  assert.equal(h.telemetry.events().filter((e) => e.type === 'transition').length, 0);
});

test('disable() restores suspended studios from their checkpoints', async () => {
  const h = harness();
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
  h.setEnabled(false);
  await h.manager.disable();
  assert.equal(h.manager.stateOf('a'), 'active');
  assert.deepEqual(h.adapters.get('a')?.log, ['snapshot', 'suspend', 'resume']);
});

test('pressure enters at 80 percent, suspends warm studios, exits below 65 percent held', async () => {
  const small: ResourceBudgetProfile = { ...NORMAL_PROFILE, envelopeBytes: 1000 };
  const h = harness({ profile: small });
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.manager.trackedBytes(); // resolves the active studio's adapter lazily
  h.adapters.get('a')!.setBytes(500);
  h.adapters.get('b')!.setBytes(300);
  assert.equal(h.manager.evaluatePressure(), 'pressure');
  assert.ok(h.telemetry.events().some((e) => e.type === 'pressure-enter'));
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended'); // grace bypassed
  h.adapters.get('a')!.setBytes(0);
  h.adapters.get('b')!.setBytes(600);
  assert.equal(h.manager.evaluatePressure(), 'pressure'); // exit needs 10s hold
  h.clock.advance(10_000);
  assert.equal(h.manager.evaluatePressure(), 'normal');
  assert.ok(h.telemetry.events().some((e) => e.type === 'pressure-exit'));
});

test('critical pressure blocks optional admission', async () => {
  const small: ResourceBudgetProfile = { ...NORMAL_PROFILE, envelopeBytes: 1000 };
  const h = harness({ profile: small });
  await h.manager.activate('a');
  h.manager.trackedBytes();
  h.adapters.get('a')!.setBytes(960);
  assert.equal(h.manager.evaluatePressure(), 'critical');
  assert.equal(h.manager.admissionAllowed(), false);
  assert.ok(h.telemetry.events().some((e) => e.type === 'admission-blocked'));
  h.adapters.get('a')!.setBytes(100);
  assert.equal(h.manager.admissionAllowed(), true);
});

test('an external probe ratio raises and holds pressure independently of the estimate', async () => {
  const h = harness({ profile: { ...NORMAL_PROFILE, envelopeBytes: 1_000_000 } });
  await h.manager.activate('a');
  await h.manager.activate('b');
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended'); // settled: one warm slot, a suspended
  await h.manager.activate('a');
  await h.manager.activate('b'); // a warm again
  h.manager.trackedBytes();
  assert.equal(h.manager.evaluatePressure(0.85), 'pressure');
  const enter = h.telemetry.events().find((e) => e.type === 'pressure-enter');
  assert.equal(enter?.externalRatio, 0.85);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended'); // probe pressure bypasses grace too
  // Estimate alone is far below the exit threshold; the probe holds pressure.
  assert.equal(h.manager.evaluatePressure(0.7), 'pressure');
  h.clock.advance(10_000);
  assert.equal(h.manager.evaluatePressure(0.7), 'pressure'); // hold only counts below 65%
  h.clock.advance(10_000);
  assert.equal(h.manager.evaluatePressure(0.5), 'pressure'); // hold restarts now
  h.clock.advance(10_000);
  assert.equal(h.manager.evaluatePressure(0.5), 'normal');
});

test('external ratios are sanitized: NaN and negatives ignored, above-one clamped', async () => {
  const h = harness({ profile: { ...NORMAL_PROFILE, envelopeBytes: 1_000_000 } });
  await h.manager.activate('a');
  h.manager.trackedBytes();
  assert.equal(h.manager.evaluatePressure(Number.NaN), 'normal');
  assert.equal(h.manager.evaluatePressure(-0.5), 'normal');
  assert.equal(h.manager.evaluatePressure(0), 'normal');
  assert.equal(h.manager.evaluatePressure(1.7), 'critical'); // clamped to 1, still >= 95%
});

test('churn detection extends the warm grace after repeated resume cycles', async () => {
  const h = harness();
  await h.manager.activate('a');
  for (let cycle = 0; cycle < 3; cycle++) {
    await h.manager.activate('b');
    await h.manager.suspend('a', 'test');
    assert.equal(h.manager.stateOf('a'), 'suspended');
    await h.manager.activate('a');
  }
  assert.ok(h.telemetry.events().some((e) => e.type === 'churn' && e.studioId === 'a'));
  await h.manager.activate('b');
  // Churned studio keeps a longer grace: still warm after the standard 30 s.
  h.clock.advance(WARM_GRACE_MS);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'warm');
  h.clock.advance(WARM_GRACE_MS * 4);
  await flush();
  assert.equal(h.manager.stateOf('a'), 'suspended');
});

test('concurrent activation of the same studio is deduplicated', async () => {
  const h = harness();
  const first = h.manager.activate('a');
  const second = h.manager.activate('a');
  assert.equal(first, second);
  await first;
  assert.equal(h.manager.stateOf('a'), 'active');
});
