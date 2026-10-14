# Isolated state and density evidence

Base: theme-exchange item `574856e2`. No application geometry, saved preferences, density semantics or consumer markup changed.

The existing component gallery now runs against all 27 explicit choices from the real `THEME_CHOICES` registry,
using production resolveTheme/applyLook/applyUiPrefs. Each palette tests compact/normal/comfortable gaps (3/6/10px),
preserves 13px control type and checks all 27 exchange aliases against live source roles. No hand-copied theme list.
The system choice is not asserted as an explicit named palette; its OS behavior remains an app/integration concern.

A reduced-motion, 26px body-font stress case checks the long German field label and reachable overlay content.
Density changes leave editor font/line height and document page/canvas tokens untouched. This is component evidence,
not proof that the whole application passes 200% text resizing or that fixed-size inspector labels have been migrated.

`check:ds:catalog` enforces the exact eleven required primitive contract IDs, no duplicates, nonempty states/exports,
existing linked tests, and honest caveats for an untested export. It is an existence checker, not a test instrumentation
or skipped-state coverage system. Canonical pixel goldens are not introduced or auto-approved.

The gallery's deterministic defaults now fix deviceScaleFactor 1, en-GB locale and Europe/Berlin timezone.
Ordinary runs have updateSnapshots none. Screenshot artifacts include explicit palettes and the text stress case.
No Storybook installation, new ESLint stack, billed service, app engine bypass or native build is introduced.

Verification: 44 Playwright cases pass (28 appearance cases + prior 16); script/catalog and existing unit gates retained.
Full app screenshots/E2E, native renderer, forced colors, exact SDK behavior and full contrast/accessibility audits remain open.

Roadmap delta: palette/density/text-stress evidence and catalog existence gate added without app baselines.
Density control-height/row redesign, P1.T1 importer UI and P3 migration remain unstarted.
