# Somnia Phase 1

Desktop foundation and reliable editor core. Development-only, not a complete desktop installer.

```sh
npm ci
npm run build
npm run test:core
npx playwright install chromium
npm run test:e2e
npm run dev
```

The browser development fixture is in-memory and cannot save to disk. Native filesystem integration is a separate adapter. Saving must never be simulated by a timer or localStorage toast.

Tests exercise byte-preserving edits, stable IDs/history, sandbox safety, real canvas editing and responsive CSS. See `notes/STATUS.md`, `notes/ACCEPTANCE.md`, and `notes/ADR-001-scope.md` for scope and remaining acceptance work.

New UI follows React 19 + Base UI and restyled shadcn sources. The existing Phase-0 site is not replaced by this directory.
