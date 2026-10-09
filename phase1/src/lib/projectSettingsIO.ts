/**
 * Project scope runtime: `.somnia/settings.json` of the connected folder. The file adapter registers read/write
 * when a native project is attached; the rest of the app only sees `projectOverrides` in the store and these helpers.
 * Overrides are never written into the user's stored prefs: consumers ask `effectiveWorkflow`/`effectiveDocument`.
 */
import {getState, patchState} from '../store/appStore';
import {effectivePrefs, parseProjectSettings, serializeProjectSettings, withOverride, type ProjectOverrides} from './projectSettings';

export interface ProjectSettingsBackend { read(): Promise<string | null>; write(content: string): Promise<void> }
let backend: ProjectSettingsBackend | null = null;

export async function attachProjectSettings(b: ProjectSettingsBackend): Promise<void> {
  backend = b;
  try {
    const parsed = parseProjectSettings(await b.read());
    patchState({projectOverrides: parsed.overrides, projectSettingsWarnings: [...parsed.warnings]});
  } catch (error) {
    patchState({projectOverrides: {}, projectSettingsWarnings: [`Project settings could not be read: ${error instanceof Error ? error.message : String(error)}`]});
  }
}
export function detachProjectSettings(): void {
  backend = null;
  patchState({projectOverrides: {}, projectSettingsWarnings: []});
}
export const projectSettingsAvailable = (): boolean => backend !== null;

/** Set (or with `inherit` remove) one override and persist `.somnia/settings.json`. The store changes only after the write succeeded. */
export async function setProjectOverride(id: string, value: unknown, inherit = false): Promise<void> {
  if (!backend) throw new Error('No project folder is connected');
  const next: ProjectOverrides = withOverride(getState().projectOverrides, id, value, inherit);
  await backend.write(serializeProjectSettings(next));
  patchState({projectOverrides: next});
}
export const effectiveWorkflow = () => effectivePrefs(getState(), getState().projectOverrides).workflowPrefs as unknown as ReturnType<typeof getState>['workflowPrefs'];
export const effectiveDocument = () => effectivePrefs(getState(), getState().projectOverrides).documentPrefs as unknown as ReturnType<typeof getState>['documentPrefs'];
