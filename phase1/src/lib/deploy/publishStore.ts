/**
 * State and actions of the Publish panel. React-free, so the whole flow is tested without a DOM.
 *
 * Everything that changes the server or the saved targets goes through the deploy CommandSpecs
 * (origin `ui`): the confirmation dialogs, the one-time token and the human-origin checks stay in
 * one place. This file never mints a token, never touches a gesture and never sees key material;
 * the only key-shaped value it holds is the public key line returned by `deploy.key.create`.
 */
import { mayCancel } from './setup';
import type { DeployBackend, DeployOutcome, DeployPlan, DeployProgressEvent, DeployTarget, DeployTargetStatus } from './contract';
import { buildTarget, describeBuildFailure, describeDeployError, parseProgress, slugTargetId, sortReleases, validateTargetForm, type BuildPhase, type BuildSummary, type DeployErrorInfo, type ProgressInfo, type TargetForm } from './publishModel';

export type PublishView = 'home' | 'form' | 'rollback' | 'setup';
export type PublishBusy = 'load' | 'save' | 'delete' | 'key' | 'trust' | 'replace' | 'publish' | 'rollback' | 'releases' | null;
export interface PublishFailure extends DeployErrorInfo { targetId: string | null; during: Exclude<PublishBusy, null> }
export interface PublishResult { kind: 'publish' | 'rollback'; targetId: string; outcome: DeployOutcome }
export interface PublishState {
  open: boolean;
  view: PublishView;
  loaded: boolean;
  targets: DeployTargetStatus[];
  selectedId: string | null;
  /** Set while editing an existing target; null when adding. */
  editingId: string | null;
  busy: PublishBusy;
  /** Steps seen during the running publish, in order, plus the latest one. */
  progress: { seen: ProgressInfo[]; latest: ProgressInfo | null };
  /** Build before publish: null when the project needs none. A failed build never reaches deploy.plan. */
  build: { phase: BuildPhase | null; summary: BuildSummary | null };
  result: PublishResult | null;
  failure: PublishFailure | null;
  /** Public key lines created in this session (public, not secret). */
  publicKeys: Record<string, string>;
  releases: string[];
  releasesFor: string | null;
  /** Release the last publish or rollback made live, per target. Session memory only. */
  liveByTarget: Record<string, string>;
  /** Plans staged by an agent via deploy.plan: the person still has to click Publish. */
  staged: DeployPlan | null;
  cancelRequested: boolean;
}

export interface PublishDeps {
  run: (id: string, params?: unknown) => Promise<unknown>;
  backend: Pick<DeployBackend, 'targetsList' | 'releasesList' | 'openSite' | 'liveRelease'>;
  /** Subscribes to deploy-progress. Returns the unsubscribe function (may resolve later). */
  onProgress: (fn: (e: DeployProgressEvent) => void) => () => void;
  /**
   * Static build of the project (F3 path: ProjectRunner build, then the native artifact collector).
   * Absent or `needed() === false` means the project is published as it is.
   */
  build?: {
    needed: () => boolean;
    /** Runs the build; resolves when it finished or failed. The outcome is read from the snapshot. */
    run: () => Promise<void>;
    getSnapshot: () => { phase: string; errorKey?: string; errorPath?: string; summary?: { fileCount: number; totalBytes: number } };
    subscribe: (fn: () => void) => () => void;
  };
}

const initial = (): PublishState => ({
  open: false, view: 'home', loaded: false, targets: [], selectedId: null, editingId: null, busy: null, progress: { seen: [], latest: null }, build: { phase: null, summary: null },
  result: null, failure: null, publicKeys: {}, releases: [], releasesFor: null, liveByTarget: {}, staged: null, cancelRequested: false,
});

export function createPublishStore(deps: PublishDeps) {
  let state = initial();
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PublishState>) => { state = { ...state, ...patch }; for (const fn of [...listeners]) fn(); };
  let off: (() => void) | null = null;

  const fail = (e: unknown, targetId: string | null, during: Exclude<PublishBusy, null>) => set({ busy: null, failure: { ...describeDeployError(e), targetId, during } });
  const statusOf = (id: string) => state.targets.find(s => s.target.id === id);

  /** Runs one busy action. Guards against double clicks: a second call while busy is ignored. */
  async function guarded<T>(busy: Exclude<PublishBusy, null>, targetId: string | null, fn: () => Promise<T>): Promise<T | undefined> {
    if (state.busy) return undefined;
    set({ busy, failure: null });
    try { const r = await fn(); if (state.busy === busy) set({ busy: null }); return r; }
    catch (e) { fail(e, targetId, busy); return undefined; }
  }

  async function refresh(): Promise<void> {
    try {
      const targets = await deps.backend.targetsList();
      const selectedId = targets.some(s => s.target.id === state.selectedId) ? state.selectedId : targets[0]?.target.id ?? null;
      const liveByTarget: Record<string, string> = {};
      if (deps.backend.liveRelease) for (const s of targets) {
        // Live must be read from current, never inferred from a successful outcome or ordering.
        try { const live = await deps.backend.liveRelease(s.target.id); if (live) liveByTarget[s.target.id] = live; } catch { /* unverifiable live status remains unlabelled */ }
      }
      set({ targets, selectedId, loaded: true, liveByTarget });
    } catch (e) { set({ loaded: true, failure: { ...describeDeployError(e), targetId: null, during: 'load' } }); }
  }

  async function loadReleases(targetId: string): Promise<void> {
    set({ releases: [], releasesFor: targetId });
    await guarded('releases', targetId, async () => {
      const [raw, live] = await Promise.all([deps.backend.releasesList(targetId), deps.backend.liveRelease ? deps.backend.liveRelease(targetId) : Promise.resolve(null)]);
      const ids = sortReleases(raw);
      const liveByTarget = { ...state.liveByTarget };
      delete liveByTarget[targetId];
      if (live) liveByTarget[targetId] = live;
      if (state.releasesFor === targetId) set({ liveByTarget });
      if (state.releasesFor === targetId) set({ releases: ids });
    });
  }

  const api = {
    getState: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

    /** Starts listening to deploy-progress. Safe to call more than once. */
    attach() {
      if (off) return;
      off = deps.onProgress(e => {
        if (!state.busy || (state.busy !== 'publish' && state.busy !== 'rollback')) return;
        if (e.targetId !== state.selectedId) return;
        const info = parseProgress(e.step);
        if (info.step === 'other') return;
        const seen = state.progress.seen.some(s => s.step === info.step) ? state.progress.seen.map(s => s.step === info.step ? info : s) : [...state.progress.seen, info];
        set({ progress: { seen, latest: info } });
      });
    },
    detach() { off?.(); off = null; },

    async open(opts: { view?: PublishView; targetId?: string } = {}) {
      set({ open: true, view: opts.view ?? 'home', failure: null, result: null, ...(opts.targetId ? { selectedId: opts.targetId } : {}) });
      await refresh();
      if (opts.view === 'rollback' && state.selectedId) await loadReleases(state.selectedId);
      if (state.targets.length === 0 && opts.view === undefined) set({ view: 'form', editingId: null });
    },
    /** A running publish cannot be cancelled from here, so closing only hides the dialog. */
    close() { set({ open: false, failure: state.busy ? state.failure : null }); },
    refresh,

    select(id: string) { if (!state.busy) set({ selectedId: id, failure: null, result: null, releases: [], releasesFor: null }); },
    showSetup(id: string) { if (!state.busy) set({ view: 'setup', selectedId: id, failure: null }); },
    showHome() { if (!state.busy) set({ view: 'home', failure: null, editingId: null }); },
    showForm(editId: string | null = null) { if (!state.busy) set({ view: 'form', editingId: editId, failure: null, result: null }); },
    async showRollback(targetId?: string) {
      const id = targetId ?? state.selectedId; if (!id || state.busy) return;
      set({ view: 'rollback', selectedId: id, failure: null, result: null });
      await loadReleases(id);
    },
    /** Opens https://<domain> of the target. The address is built in Rust from the saved domain. */
    async openSite(id: string) { try { await deps.backend.openSite(id); } catch (e) { set({ failure: { ...describeDeployError(e), targetId: id, during: 'load' } }); } },
    dismissFailure() { set({ failure: null }); },
    dismissResult() { set({ result: null }); },
    stagePlan(plan: DeployPlan) { set({ staged: plan, selectedId: state.targets.some(s => s.target.id === plan.targetId) ? plan.targetId : state.selectedId }); },
    clearStaged() { set({ staged: null }); },

    /** Validates, saves and (for a new server) goes straight on to the key step. Returns the saved id, or null on validation or save failure. */
    async saveTarget(form: TargetForm): Promise<string | null> {
      if (Object.keys(validateTargetForm(form)).length) return null;
      const editing = state.editingId;
      const id = editing ?? slugTargetId(form.name, state.targets.map(s => s.target.id));
      const target: DeployTarget = buildTarget(form, id);
      const ok = await guarded('save', id, async () => { await deps.run('deploy.target.save', { target }); return true; });
      if (!ok) return null;
      await refresh();
      set({ selectedId: id, view: 'home', editingId: null });
      return id;
    },
    async deleteTarget(id: string, deleteKey: boolean) {
      await guarded('delete', id, async () => { await deps.run('deploy.target.delete', { targetId: id, deleteKey }); });
      if (state.failure) return;
      const { [id]: _k, ...keys } = state.publicKeys;
      set({ publicKeys: keys, releases: [], releasesFor: null });
      await refresh();
    },

    async finishSetup(id: string) {
      const t = statusOf(id)?.target; if (!t) return;
      await deps.run('deploy.target.save', { target: { ...t, user: 'somnia' } });
      await refresh();
    },
    async showPublicKey(id: string): Promise<string | null> {
      const r = await guarded('key', id, async () => await deps.run('deploy.key.public', { targetId: id }) as { publicKey: string });
      if (!r) return null;
      set({ publicKeys: { ...state.publicKeys, [id]: r.publicKey } });
      return r.publicKey;
    },
    async cancelPublish(id: string) {
      if (state.busy !== 'publish' || state.cancelRequested || !mayCancel(state.progress.seen)) return;
      set({ cancelRequested: true });
      try { const r = await deps.run('deploy.cancel', { targetId: id }) as { cancelled: boolean }; if (!r.cancelled) set({ cancelRequested: false }); }
      catch (e) { set({ cancelRequested: false, failure: { ...describeDeployError(e), targetId: id, during: 'publish' } }); }
    },
    async createKey(id: string): Promise<string | null> {
      const key = await guarded('key', id, async () => (await deps.run('deploy.key.create', { targetId: id })) as { publicKey: string });
      if (!key) return null;
      set({ publicKeys: { ...state.publicKeys, [id]: key.publicKey } });
      await refresh();
      return key.publicKey;
    },
    async trust(id: string) {
      await guarded('trust', id, async () => { await deps.run('deploy.hostkey.trust', { targetId: id }); });
      await refresh();
    },
    /** Changed-key flow. The old fingerprint is the one the app pinned; the command asks for the second confirmation. */
    async replaceKey(id: string) {
      const old = statusOf(id)?.fingerprint;
      if (!old) { await api.trust(id); return; }
      await guarded('replace', id, async () => { await deps.run('deploy.hostkey.replace', { targetId: id, oldFingerprint: old }); });
      await refresh();
    },

    async publish(id: string) {
      if (state.busy) return;
      set({ progress: { seen: [], latest: null }, build: { phase: null, summary: null }, result: null, selectedId: id, cancelRequested: false });
      const outcome = await guarded('publish', id, async () => {
        // Build first. deploy.plan never runs project scripts: it only reads the finished, re-verified output.
        const b = deps.build;
        if (b?.needed()) {
          const sync = () => { const snap = b.getSnapshot(); if (snap.phase === 'installing' || snap.phase === 'building' || snap.phase === 'collecting') set({ build: { phase: snap.phase, summary: null } }); };
          const stop = b.subscribe(sync);
          set({ build: { phase: 'building', summary: null } });
          try { await b.run(); } catch { /* the snapshot carries the outcome */ } finally { stop(); }
          const snap = b.getSnapshot();
          if (snap.phase !== 'done' || !snap.summary) {
            set({ busy: null, build: { phase: null, summary: null }, failure: { ...describeBuildFailure(snap.errorKey, snap.errorPath), targetId: id, during: 'publish' } });
            return null;
          }
          set({ build: { phase: 'done', summary: { fileCount: snap.summary.fileCount, totalBytes: snap.summary.totalBytes } } });
        }
        const r = (await deps.run('deploy.publish', { targetId: id })) as DeployOutcome | { status: 'cancelled' };
        return 'status' in r ? null : r;
      });
      if (outcome) set({ result: { kind: 'publish', targetId: id, outcome }, staged: state.staged?.targetId === id ? null : state.staged });
      set({ progress: { seen: [], latest: null }, build: { phase: null, summary: null } });
      await refresh();
    },
    async rollback(id: string, releaseId: string) {
      if (state.busy) return;
      set({ progress: { seen: [], latest: null }, result: null });
      const outcome = await guarded('rollback', id, async () => {
        const r = (await deps.run('deploy.rollback', { targetId: id, releaseId })) as DeployOutcome | { status: 'cancelled' };
        return 'status' in r ? null : r;
      });
      if (outcome) set({ result: { kind: 'rollback', targetId: id, outcome }, view: 'home' });
      set({ progress: { seen: [], latest: null } });
      await refresh();
    },
  };
  return api;
}
export type PublishStore = ReturnType<typeof createPublishStore>;
