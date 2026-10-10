/**
 * tauri-plugin-dialog injects an init script into every webview that replaces window.confirm and
 * window.alert with ASYNC IPC wrappers. Every destructive-action guard in this app calls them
 * synchronously (`if(!window.confirm(...))`), and a Promise is always truthy - so Cancel would not
 * stop discard/delete/close, and the denied IPC surfaces as "plugin:dialog|confirm not allowed by ACL".
 * Deleting the own properties restores the webview's native synchronous dialogs.
 * Runs at bootstrap, before any user interaction can reach a guard.
 */
export function restoreNativeDialogs(win:Window=window):void{
 delete (win as {confirm?:unknown}).confirm;
 delete (win as {alert?:unknown}).alert;
}
