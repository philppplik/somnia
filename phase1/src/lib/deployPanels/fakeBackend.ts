/**
 * In-memory DeployBackend for tests and the development fixture. Never imported by the app bundle.
 * It stands in for the Rust engine: no network, no keychain, no real server. Targets move through
 * key-missing, needs-trust and ready exactly as the real service reports them.
 */
import type { DeployBackend, DeployPlan, DeployPlanFile, DeployTarget, DeployTargetStatus } from '../deploy/contract';

export const FAKE_FINGERPRINT = 'SHA256:Qm7xAbCdEfGhIjKlMnOpQrStUvWxYz0123456Zk4';
export interface FakeDeployOptions {
  targets?: DeployTargetStatus[];
  releases?: string[];
  live?: string | null;
  /** Files of the pretend build and their state against the live site. */
  files?: DeployPlanFile[];
}
export function createFakeDeployBackend(opts: FakeDeployOptions = {}) {
  const targets = new Map((opts.targets ?? []).map(s => [s.target.id, s]));
  const calls: string[] = [];
  let live = opts.live ?? null;
  const releases = [...(opts.releases ?? [])];
  const files = opts.files ?? [];
  const plan = (id: string, action: 'publish' | 'rollback', releaseId?: string): DeployPlan => ({ planHash: 'f'.repeat(64), action, targetId: id, fingerprint: targets.get(id)?.fingerprint ?? FAKE_FINGERPRINT, buildId: 'fake-build', liveRelease: live, releaseId: releaseId ?? null, files });
  const need = (id: string) => { const s = targets.get(id); if (!s) throw Object.assign(new Error('deploy:target-not-found'), { expected: true }); return s; };
  const backend: DeployBackend = {
    liveRelease: async () => live,
    targetsList: async () => [...targets.values()],
    targetSave: async (t: DeployTarget) => { calls.push(`save:${t.id}`); const prev = targets.get(t.id); targets.set(t.id, { target: t, state: prev?.state ?? 'key-missing', fingerprint: prev?.fingerprint }); },
    targetDelete: async id => { calls.push(`delete:${id}`); targets.delete(id); },
    plan: async id => { need(id); calls.push(`plan:${id}`); return plan(id, 'publish'); },
    planRollback: async (id, r) => { need(id); calls.push(`planRollback:${id}`); return plan(id, 'rollback', r); },
    confirmIssue: async () => 'fake-token',
    publish: async a => { calls.push(`publish:${a.targetId}`); live = '20261013T170000Z-fake01'; releases.push(live); return { releaseId: live, url: need(a.targetId).target.domain ? `https://${need(a.targetId).target.domain}` : null, rolledBack: false }; },
    rollback: async a => { calls.push(`rollback:${a.releaseId}`); live = a.releaseId; return { releaseId: a.releaseId, rolledBack: false }; },
    hostkeyProbe: async () => ({ algorithm: 'ssh-ed25519', fingerprint: FAKE_FINGERPRINT }),
    hostkeyTrust: async id => { const s = need(id); targets.set(id, { ...s, state: 'ready', fingerprint: FAKE_FINGERPRINT }); },
    hostkeyReplace: async () => {},
    keyCreate: async id => { const s = need(id); targets.set(id, { ...s, state: 'needs-trust' }); return 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIfakefakefakefakefakefakefakefakefake somnia'; },
    releasesList: async () => [...releases],
    openSite: async id => { calls.push(`open:${id}`); },
  };
  return { backend, calls, targets };
}
