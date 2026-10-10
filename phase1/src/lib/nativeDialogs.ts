/**
 * tauri-plugin-dialog injects an init script into every webview that replaces window.confirm and
 * window.alert with ASYNC IPC wrappers. Every destructive-action guard in this app calls them
 * synchronously (`if(!window.confirm(...))`), and a Promise is always truthy - so Cancel would not
 * stop discard/delete/close, and the denied IPC surfaces as "plugin:dialog|confirm not allowed by ACL".
 * Deleting the own properties restores the webview's native synchronous dialogs.
 * Runs at bootstrap, before any user interaction can reach a guard.
 *
 * Web builds (browser tab, Playwright CI) have no plugin init script: there the own/native confirm
 * and alert are the real synchronous ones and MUST NOT be deleted, otherwise every guard throws
 * "window.confirm is not a function". We therefore only touch dialogs inside a Tauri webview.
 */
export function restoreNativeDialogs(win:Window=window):void{
 const w=win as {__TAURI_INTERNALS__?:unknown;confirm?:unknown;alert?:unknown};
 if(!w.__TAURI_INTERNALS__)return;
 delete w.confirm;
 delete w.alert;
}
