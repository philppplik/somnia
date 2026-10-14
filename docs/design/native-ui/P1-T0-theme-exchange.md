# P1.T0: inert theme exchange

Base: P0/P1 through `b56912c3` and compatibility concept `ca2271a8`.
This package adds no dependency, app setting, theme application, component replacement or network operation.

`src/lib/themeExchange.ts` exports a pure bounded JSON/CSS parser, semantic mapping table,
namespaced variable map, and deterministic color-only JSON/CSS exporter.

- Accepts `registry:theme` and `registry:style` as data. Reads only known color roles under cssVars.light/dark/theme.
- Reports registry CSS/files/dependencies and known font/radius/chart/shadow/tracking/spacing metadata as ignored.
  These values never execute or enter a stylesheet. Unknown color roles fail instead of silently claiming full compatibility.
- CSS accepts only exact :root/.dark blocks and variable declarations, with duplicates rejected.
  It does not accept the @theme/@layer scaffold, custom selectors, imports or fonts; paste a declarations-only export.
- Literal colors: bounded hex/rgb/hsl/oklch subset. No var/calc/url/named colors or legacy channels-only HSL.
- Limits: 64KiB input, 256 variable entries, 128-character color values, 12 levels and 2048 JSON nodes.
  Duplicate/prototype keys are rejected before ordinary JSON normalization can discard them.
- Mapper emits only --sc-* roles, never --accent, radii, document colors or arbitrary property names.
- The isolated gallery aliases the same --sc-* roles to current live Somnia values. No alias stylesheet is imported by production.

Tests cover bounded/duplicate/unknown/malicious inputs, deterministic recognized-role round trips and all role aliases.
A live check of https://tweakcn.com/r/themes/amethyst-haze.json on 2026-10-14 successfully normalized recognized light/dark roles
and reported ignored body CSS, font/radius/chart/shadow/tracking metadata. This is one sample, not a universal compatibility promise.
No upstream generator implementation or preset is bundled.

`npm run test:ds:exchange` runs pure unit tests. The existing isolated Playwright gate also verifies every alias against
its resolved source variable in light/dark and standard/high contrast while preserving a custom yellow seed.
The fixture's alias card/action is pixel-review evidence, not app theme-application proof.

Remaining: no contrast certification from syntactic validity; no runtime preview/app Apply/Undo/Reset/storage yet.
Those belong to P1.T1 and need the current app baselines and preference precedence tests.
Native desktop and complete accessibility checks remain separate. Full typecheck still needs generated slides engine assets.

Roadmap delta: P1.T0 pure parser/mapper, color-only round trip and isolated --sc-* alias proof implemented.
P1.T1 importer UI/application and production aliases unstarted. P3 unchanged.
