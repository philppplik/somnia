/** Global preview preference. Missing settings from older installs migrate to scripts on. */
export const PREVIEW_SETTINGS_KEY = 'somnia.previewPrefs.v1';
export const DEFAULT_PREVIEW_SCRIPTS = true;
export function sanitizePreviewSettings(value: unknown): { previewScripts: boolean } {
  const raw = value as { previewScripts?: unknown } | null;
  return { previewScripts: typeof raw?.previewScripts === 'boolean' ? raw.previewScripts : DEFAULT_PREVIEW_SCRIPTS };
}
export function readPreviewScripts(): boolean {
  try { return sanitizePreviewSettings(JSON.parse(localStorage.getItem(PREVIEW_SETTINGS_KEY) || '{}')).previewScripts; }
  catch { return DEFAULT_PREVIEW_SCRIPTS; }
}
export function savePreviewScripts(previewScripts: boolean): void {
  try { localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify({ previewScripts })); }
  catch { /* Session-only when storage is unavailable. */ }
}
export const previewScriptsProjectKey = (name: string): string => `somnia.preview.scripts.${name}`;
export function readProjectPreviewScripts(name: string): boolean | null {
  try { const value = localStorage.getItem(previewScriptsProjectKey(name)); return value === '1' ? true : value === '0' ? false : null; }
  catch { return null; }
}
/** Only an explicit 0/1 project decision overrides the global setting. */
export function resolvePreviewScripts(projectChoice: boolean | null, globalDefault: boolean): boolean {
  return projectChoice ?? globalDefault;
}
