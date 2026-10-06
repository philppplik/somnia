# Somnia Phase 1

The Somnia app: React frontend, Tauri/Rust desktop backend and the editor-core package. Architecture overview: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Build and release: [../docs/BUILD-AND-RELEASE.md](../docs/BUILD-AND-RELEASE.md).

```sh
npm ci
npm run build
npm run test:core
npx playwright install chromium
npm run test:e2e
npm run dev
```

In the plain dev server the app saves through the File System Access API (Chromium) or works on a ZIP copy; the desktop app saves through the Rust backend. Both sit behind the same storage port (`src/lib/fileAdapter.ts`). Saving must never be simulated by a timer or localStorage toast.

Tests exercise byte-preserving edits, stable IDs/history, sandbox safety, real canvas editing and responsive CSS. See `notes/ACCEPTANCE.md` and `notes/ADR-001-scope.md` for the original scope and acceptance gates (`notes/STATUS.md` is a historical log).

New UI follows React 19 + Base UI and restyled shadcn sources. The existing Phase-0 site is not replaced by this directory.

## Welcome popup

After an update Somnia shows a one-time "Welcome to Somnia vX" popup (`src/components/WelcomeDialog.tsx`, logic in `src/lib/welcome.ts`). It is skipped on a first install and never repeats for the same version; state is the localStorage key `somnia.welcome.seen.v1`. The heading uses Momo Signature (SIL OFL 1.1, embedded as a Latin subset in `src/assets/fonts`, licence text next to it, no network request).
