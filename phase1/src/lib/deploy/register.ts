import { registerCoreCommandSpec } from '../coreCommandRegistration';
import type { DeployBackend } from './contract';
import { createDeployCommandSpecs } from './commandSpecs';

/** Registers the deploy specs with the shared dispatcher. Returns one disposer for all of them. */
export function registerDeployCommands(backend: DeployBackend): () => void {
  const offs = createDeployCommandSpecs({ backend: () => backend }).map(spec => registerCoreCommandSpec(spec));
  return () => { for (const off of offs.reverse()) off(); };
}
