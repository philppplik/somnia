/**
 * The build this window runs, announced to collab peers (concept 7.4): office files sync
 * only between identical builds because every peer's engine must produce identical results.
 * 'dev' outside the vite build (tests, tooling); the session handshake treats it as unknown.
 */
export const APP_BUILD:string=typeof __APP_RELEASE__!=='undefined'?__APP_RELEASE__:'dev';
