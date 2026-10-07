# Account-auth documentation integration

## Baseline and scope

Base: `somnia-agent` commit `bb9d1fab7682f402a6a88280e69dd0ab71640b81`.
Feature branch: `feature/auth-docs`. Docs only; no runtime changes, library additions,
paid calls, CI runs, push or PR.

## Required before marking account OAuth implemented

- [ ] Receive and inspect auth-research primary source URLs, check date and conclusion.
- [ ] Receive and inspect auth implementation at a concrete commit or patch.
- [ ] Replace pending user instructions with actual UI and cancellation/disconnect behavior.
- [ ] Replace developer placeholders with exact endpoints, commands, token lifecycle,
      registration, identity/scopes and persistence/refresh/revocation implementation.
- [ ] Record policy differences between local OSS and other distributions.
- [ ] Record actual dependency versions/licenses and notices.
- [ ] Review any settings-wave label changes against the integrated app.
- [ ] Reconcile older design docs by linking to this current implementation guide.
- [ ] Run mocked auth tests with `node:test` / `tsx --test` and record exact commands.
- [ ] Run packaged-app OS credential and callback checks on Windows, macOS and Linux.
- [ ] Keep unverified areas visibly pending; no paid fallback or automatic inference claim.

## Documentation verification

`node --test scripts/auth-docs.test.mjs` checks local Markdown links, required docs,
explicit baseline/OAuth status and correspondence of current IPC/metadata endpoints
to the source tree. It is not a renderer, OAuth security audit or live auth test.

Source-map checks help catch accidental drift but do not replace reading the merged
implementation. No account login, live inference or native OS-store round trip was
performed as part of this documentation baseline.
