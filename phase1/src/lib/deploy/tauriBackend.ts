import { invokeCmd } from '../invokeCmd';
import type { DeployBackend } from './contract';

/** Maps a rejected IPC call to an expected Error carrying only the stable `deploy:<code>` string. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
    const m = /deploy:[a-z-]+/.exec(raw);
    throw Object.assign(new Error(m ? m[0] : 'deploy:engine-failed'), { expected: true });
  }
}

/** The only DeployBackend that talks to Rust. Parameters and results never carry key material. */
export function createTauriDeployBackend(): DeployBackend {
  return {
    keyPublic: targetId => call(() => invokeCmd('deploy_key_public', { targetId })),
    liveRelease: targetId => call(() => invokeCmd('deploy_live_release', { targetId })),
    cancel: targetId => call(() => invokeCmd('deploy_cancel', { targetId })),
    bootstrapScript: targetId => call(() => invokeCmd('deploy_bootstrap_script', { targetId })),
    bootstrapRun: input => call(() => invokeCmd('deploy_bootstrap_run', input)),
    dnsCheck: targetId => call(() => invokeCmd('deploy_dns_check', { targetId })),
    targetsList: () => call(() => invokeCmd('deploy_targets_list')),
    targetSave: async target => { await call(() => invokeCmd('deploy_target_save', { target })); },
    targetDelete: async (targetId, deleteKey) => { await call(() => invokeCmd('deploy_target_delete', { targetId, deleteKey })); },
    plan: targetId => call(() => invokeCmd('deploy_plan', { targetId })),
    planRollback: (targetId, releaseId) => call(() => invokeCmd('deploy_plan_rollback', { targetId, releaseId })),
    confirmIssue: planHash => call(() => invokeCmd('deploy_confirm_issue', { planHash })),
    publish: args => call(() => invokeCmd('deploy_publish', args)),
    rollback: args => call(() => invokeCmd('deploy_rollback', args)),
    hostkeyProbe: targetId => call(() => invokeCmd('deploy_hostkey_probe', { targetId })),
    hostkeyTrust: async (targetId, fingerprint) => { await call(() => invokeCmd('deploy_hostkey_trust', { targetId, fingerprint })); },
    hostkeyReplace: async args => { await call(() => invokeCmd('deploy_hostkey_replace', args)); },
    keyCreate: targetId => call(() => invokeCmd('deploy_key_create', { targetId })),
    openSite: async targetId => { await call(() => invokeCmd('deploy_open_site', { targetId })); },
    releasesList: targetId => call(() => invokeCmd('deploy_releases', { targetId })),
  };
}
