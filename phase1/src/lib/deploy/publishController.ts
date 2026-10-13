/** The one Publish store the app uses: wired to the command dispatcher, the Tauri backend and the progress event. */
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { commandDispatcher } from '../commandDispatcher';
import { DEPLOY_PROGRESS_EVENT, type DeployProgressEvent } from './contract';
import { subscribeStagedPlans } from './commandSpecs';
import { createTauriDeployBackend } from './tauriBackend';
import { createPublishStore, type PublishStore } from './publishStore';

let store: PublishStore | null = null;
/** Desktop only: the web build has no server engine, so the panel is not offered there. */
export const publishAvailable = (): boolean => isTauri();

export function getPublishStore(): PublishStore {
  if (store) return store;
  const backend = createTauriDeployBackend();
  store = createPublishStore({
    run: (id, params) => commandDispatcher.runCommand(id, params, { origin: 'ui' }),
    backend,
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
