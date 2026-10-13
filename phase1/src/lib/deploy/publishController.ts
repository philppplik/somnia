/** The one Publish store the app uses: wired to the command dispatcher, the Tauri backend and the progress event. */
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { commandDispatcher } from '../commandDispatcher';
import { DEPLOY_PROGRESS_EVENT, type DeployProgressEvent } from './contract';
import { subscribeStagedPlans } from './commandSpecs';
import { createTauriDeployBackend } from './tauriBackend';
import { getState as getAppState } from '../../store/appStore';
import { detectFramework } from '../frameworks/detect';
import { staticBuilder } from '../frameworks/staticBuildRuntime';
import { getPreviewResourceSource } from '../previewResourceSource';
import { createInstallMemo } from './publishModel';
import { createPublishStore, type PublishStore } from './publishStore';

let store: PublishStore | null = null;
const installMemo = createInstallMemo();
const depsOf = () => { const f = getAppState().files; return `${f['package.json'] ?? ''}\u0000${f['package-lock.json'] ?? ''}${f['pnpm-lock.yaml'] ?? ''}${f['yarn.lock'] ?? ''}`; };
/** Desktop only: the web build has no server engine, so the panel is not offered there. */
export const publishAvailable = (): boolean => isTauri();

export function getPublishStore(): PublishStore {
  if (store) return store;
  const backend = createTauriDeployBackend();
  store = createPublishStore({
    run: (id, params) => commandDispatcher.runCommand(id, params, { origin: 'ui' }),
    backend,
    build: {
      // Static framework projects are built first through the F3 command (ProjectRunner + deploy_artifact_collect).
      needed: () => { const f = detectFramework(getAppState().files); return !!f && f.output === 'static'; },
      run: async () => {
        const pid = getPreviewResourceSource()?.projectId ?? '', fp = depsOf(), install = installMemo.needsInstall(pid, fp);
        try { await commandDispatcher.runCommand('frameworks.buildStatic', { install }, { origin: 'ui' }); }
        finally { installMemo.record(pid, fp, staticBuilder.getSnapshot().phase === 'done'); }
      },
      getSnapshot: staticBuilder.getSnapshot,
      subscribe: staticBuilder.subscribe,
    },
    onProgress: fn => {
      let un: (() => void) | null = null, closed = false;
      void listen<DeployProgressEvent>(DEPLOY_PROGRESS_EVENT, e => fn(e.payload)).then(u => { if (closed) u(); else un = u; }).catch(() => { /* no event bridge: the progress list simply stays empty */ });
      return () => { closed = true; un?.(); };
    },
  });
  store.attach();
  subscribeStagedPlans(plan => store?.stagePlan(plan));
  return store;
}
