/** The one Publish store the app uses: wired to the command dispatcher, the Tauri backend and the progress event. */
import { SETUP_OPEN_EVENT } from './setup';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { commandDispatcher } from '../commandDispatcher';
import { DEPLOY_PROGRESS_EVENT, type DeployProgressEvent } from './contract';
import { subscribeStagedPlans } from './commandSpecs';
import { createTauriDeployBackend } from './tauriBackend';
import { detectFramework } from '../frameworks/detect';
import { staticBuilder } from '../frameworks/staticBuildRuntime';
import { nodeBuilder } from '../frameworks/nodeBuildRuntime';
import { getPreviewResourceSource } from '../previewResourceSource';
import { createInstallMemo } from './publishModel';
import { createPublishStore, type PublishStore } from './publishStore';

let store: PublishStore | null = null;
let active: typeof staticBuilder = staticBuilder;
const installMemo = createInstallMemo();
const depsOf = () => { const f = projectFiles(); return `${f['package.json'] ?? ''}\u0000${f['package-lock.json'] ?? ''}${f['pnpm-lock.yaml'] ?? ''}${f['yarn.lock'] ?? ''}`; };
let projectFiles: () => Readonly<Record<string, string>> = () => ({});
/** The component layer injects the open project's files (lib must not import the app store). */
export function configurePublish(opts: { projectFiles: () => Readonly<Record<string, string>> }): void { projectFiles = opts.projectFiles; }
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
      // Server frameworks (Next, Nuxt, SvelteKit, Astro with the Node adapter) build a kind=node bundle through frameworks.buildNode.
      needed: () => { const f = detectFramework(projectFiles()); return !!f && (f.output === 'static' || f.output === 'node'); },
      run: async () => {
        const pid = getPreviewResourceSource()?.projectId ?? '', fp = depsOf(), install = installMemo.needsInstall(pid, fp);
        const node = detectFramework(projectFiles())?.output === 'node', builder = node ? nodeBuilder : staticBuilder;
        active = builder;
        try { await commandDispatcher.runCommand(node ? 'frameworks.buildNode' : 'frameworks.buildStatic', { install }, { origin: 'ui' }); }
        finally { installMemo.record(pid, fp, builder.getSnapshot().phase === 'done'); }
      },
      getSnapshot: () => active.getSnapshot(),
      subscribe: fn => { const a = staticBuilder.subscribe(fn), b = nodeBuilder.subscribe(fn); return () => { a(); b(); }; },
    },
    onProgress: fn => {
      let un: (() => void) | null = null, closed = false;
      void listen<DeployProgressEvent>(DEPLOY_PROGRESS_EVENT, e => fn(e.payload)).then(u => { if (closed) u(); else un = u; }).catch(() => { /* no event bridge: the progress list simply stays empty */ });
      return () => { closed = true; un?.(); };
    },
  });
  store.attach();
  window.addEventListener(SETUP_OPEN_EVENT, ((e: CustomEvent<{ targetId: string }>) => { store?.showSetup(e.detail.targetId); }) as EventListener);
  subscribeStagedPlans(plan => store?.stagePlan(plan));
  return store;
}
