/**
 * Raster overrides for the shared Undo/Redo/Save/Close/Open command IDs.
 *
 * These are scoped specs, not global replacements: registerCommandSpec would overwrite
 * the project's legacy entries and collide with its dispatcher IDs. Until the shared
 * bridge supports scopes, a scope-owned dispatcher validates and logs the same specs
 * through specToCommand. TODO(P0): replace this adapter with a scope-aware shared bridge.
 * Palette and shortcut resolution stay in registerCommandScope.
 * No extra palette entries and no cross-studio history are introduced.
 */
import { registerCommandScope, type Command } from '../commandRegistry';
import { specToCommand } from '../commandBridge';
import { CommandDispatcher } from '../commandDispatcher';
import type { CommandSpec } from '../commandSpec';

/** The mounted resource owner supplies live state and keeps all pixels/history local. */
export interface RasterCommandActions {
  active: boolean;
  busy: boolean;
  docState: { past: readonly unknown[]; future: readonly unknown[] };
  source: { layerSession?: { query?: { undo: number; redo: number } | null } } | null;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
  save(): void | Promise<void>;
  close(): void | Promise<void>;
  openFile(): void | Promise<void>;
}

/** These existing UI actions take no arguments. Reject accidental or external payloads. */
const noParams = { type: 'object', properties: {}, additionalProperties: false };

export function registerRasterCommands(
  actions: () => RasterCommandActions,
  title: (key: string) => string,
  dispatcher = new CommandDispatcher(),
): () => void {
  const ready = () => actions().active && !actions().busy;
  const specs: CommandSpec<unknown, void>[] = [
    {
      id: 'edit.undo', title: title('imageeditor.undo'), category: 'Edit', shortcut: 'Mod+Z',
      level: 'ui', params: noParams,
      enabled: () => ready() && !!(actions().source?.layerSession?.query?.undo ?? actions().docState.past.length),
      run: () => {
        // History: mounted RasterEditor routes to its retained-layer OR raster-document stack.
        return actions().undo();
      },
    },
    {
      id: 'edit.redo', title: title('imageeditor.redo'), category: 'Edit', shortcut: 'Mod+Shift+Z',
      level: 'ui', params: noParams,
      enabled: () => ready() && !!(actions().source?.layerSession?.query?.redo ?? actions().docState.future.length),
      run: () => {
        // History: mounted RasterEditor routes to its retained-layer OR raster-document stack.
        return actions().redo();
      },
    },
    {
      id: 'project.save', title: title('imageeditor.save'), category: 'Project', shortcut: 'Mod+S', allowInInput: true,
      level: 'ui', params: noParams, enabled: () => ready() && !!actions().source,
      run: () => {
        // History: owner ends any live raster gesture and marks the saved raster/layer signature.
        return actions().save();
      },
    },
    {
      id: 'tab.close', title: title('imageeditor.close'), category: 'View', shortcut: 'Mod+W',
      level: 'ui', params: noParams, enabled: ready,
      run: () => {
        // History: no edit; owner's existing close guard handles dirty state/resource cleanup.
        return actions().close();
      },
    },
    {
      id: 'tools.editImage', title: title('imageeditor.openOther'), category: 'Tools',
      level: 'ui', params: noParams, enabled: ready,
      run: () => {
        // History: no edit to an existing document; owner handles the interactive file picker.
        return actions().openFile();
      },
    },
  ];
  const dispose: (() => void)[] = [];
  const commands = new Map<string, Command>();
  try {
    for (const spec of specs) {
      dispose.push(dispatcher.register(spec));
      commands.set(spec.id, specToCommand(spec, dispatcher));
    }
    dispose.push(registerCommandScope(id => actions().active ? commands.get(id) : undefined));
  } catch (error) {
    for (const off of dispose.reverse()) off();
    throw error;
  }
  return () => { for (const off of dispose.splice(0).reverse()) off(); };
}
