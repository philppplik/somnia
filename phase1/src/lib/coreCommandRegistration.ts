/** Core registrations can be replaced by a live file adapter without changing P0's unique-id registry. */
import { commandDispatcher } from './commandDispatcher';
import { registerCommandSpec } from './commandBridge';
import type { CommandSpec } from './commandSpec';

export const NO_CORE_PARAMS = { type: 'object', properties: {}, additionalProperties: false } as const;

type Entry = { spec: CommandSpec<unknown, unknown>; off?: () => void };
const registrations = new Map<string, Entry[]>();

/** Only the top provider is registered. Disposing it restores the previous provider, if any. */
export function registerCoreCommandSpec<P, R>(spec: CommandSpec<P, R>): () => void {
  const stack = registrations.get(spec.id) ?? [];
  const previous = stack.at(-1);
  previous?.off?.();
  if (previous) previous.off = undefined;
  const entry: Entry = { spec: spec as CommandSpec<unknown, unknown> };
  try { entry.off = registerCommandSpec(spec, commandDispatcher); }
  catch (error) {
    if (previous) previous.off = registerCommandSpec(previous.spec, commandDispatcher);
    throw error;
  }
  stack.push(entry);
  registrations.set(spec.id, stack);
  return () => {
    const index = stack.indexOf(entry);
    if (index < 0) return;
    const active = index === stack.length - 1;
    entry.off?.();
    stack.splice(index, 1);
    if (active && stack.length) stack.at(-1)!.off = registerCommandSpec(stack.at(-1)!.spec, commandDispatcher);
    if (!stack.length) registrations.delete(spec.id);
  };
}
