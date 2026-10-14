/**
 * Android build only (vite --mode mobile aliases '@tauri-apps/api/core' here).
 * The mobile shell has no desktop command surface (projects, git, deploy, MCP, keyring...), so every
 * `isTauri()` gate must take its browser-mode branch. `invoke` and the rest stay the real implementation.
 */
export * from '../../node_modules/@tauri-apps/api/core.js';
export const isTauri=():boolean=>false;
