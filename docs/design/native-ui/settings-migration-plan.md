# P3 Settings migration preparation

Base: importer `9df31762`. Preparation only: no Settings rewrite or new snapshot baseline.
One section per patch, retain current section names, locale keys, registry/search/modified adapters,
settings-only undo, project overrides, refs and legacy locator hooks. Appearance importer uses its own Undo/Reset lifecycle.
Do not merge it into document undo or silently include it in registry reset until that contract is reviewed.

## Per-section checklist

Each row requires before/after light/dark/high screenshots and its existing behavioral gates. Blank boxes are intentionally unfinished.

| Section | Preserve | Existing gates / special checks | Status |
| --- | --- | --- | --- |
| Modified | registry counts, single/bulk reset, import, overrides | settings-modified.spec.ts; project override tests | [ ] before [ ] migration [ ] after |
| General | language/system locale, startup/title/delete setting | settings-system.spec.ts, settings-workflow.spec.ts | [ ] before [ ] migration [ ] after |
| Appearance | look live apply/reset/undo, named IDs, custom accents, contrast, importer | settings-redesign.spec.ts, themes.spec.ts, appearance-surfaces.spec.ts, theme-import.spec.ts, extension-accent-palettes.spec.ts | [ ] before [ ] migration [ ] after |
| Window (native only) | native titlebar/material flags and desktop restrictions | desktop capture required; browser does not expose this section | [ ] native before [ ] migration [ ] native after |
| Canvas | zoom/viewport/units and session effects | settings-canvas.spec.ts | [ ] before [ ] migration [ ] after |
| Editing | autosave interval, units, save mode, project scope | settings-workflow.spec.ts, settings-modified.spec.ts | [ ] before [ ] migration [ ] after |
| Typography | UI vs document font distinction | settings-interface.spec.ts, settings-document.spec.ts | [ ] before [ ] migration [ ] after |
| Code editor | format/wrap/autocomplete/Emmet and settings undo | settings.spec.ts, settings-redesign.spec.ts | [ ] before [ ] migration [ ] after |
| Projects | backup list/save/recovery, actual IO availability | settings-backups.spec.ts | [ ] before [ ] migration [ ] after |
| Export & Publish | document cleanup defaults and project overrides | settings-document.spec.ts, settings-modified.spec.ts | [ ] before [ ] migration [ ] after |
| Collaboration | room/session/privacy preferences | existing collaboration specs; no peer disclosure changes | [ ] before [ ] migration [ ] after |
| Preview | live scripts sandbox preference | preview-scripts-settings.spec.ts | [ ] before [ ] migration [ ] after |
| Shortcuts | edit/import/export/reset conflicts and keyboard scope | settings.spec.ts, settings-redesign.spec.ts; shortcut suite | [ ] before [ ] migration [ ] after |
| AI | explicit Save lifecycle, four tabs, providers/tool permissions | mcp-settings.spec.ts; provider/settings unit gates | [ ] before [ ] migration [ ] after |
| Extensions | consent/security/enablement surface | extension/consent suites; never recompose trust markup | [ ] before [ ] migration [ ] after |
| Frameworks | current support/settings, not a fictional generic section | framework suite and command contracts | [ ] before [ ] migration [ ] after |
| Updates | availability/release checks, update channel semantics | updater unit/e2e, settings.spec.ts | [ ] before [ ] migration [ ] after |
| Advanced | real diagnostics/available operations | settings/diagnostics suite; no debug secrets in UI | [ ] before [ ] migration [ ] after |
| About | version/license content and external links | settings.spec.ts, generated license verification | [ ] before [ ] migration [ ] after |

## Capture harness, CI-only

`npm run capture:settings` runs the real app with its existing production engine prerequisites.
No fake WASM or skipped prerequisite. Set `SOMNIA_SETTINGS_CAPTURE=before-<package>` or `after-<package>`.
Artifacts live in `phase1/test-results/settings-migration/<label>/`.
The harness explicitly enumerates all 19 expected sections, checks all 18 web nav entries,
records Window as native-only rather than silently skipping missing coverage, captures top/bottom visible dialog pixels,
and writes section/control manifests. It waits for actual visible section and fonts, not an arbitrary delay.
Defaults: 1440x1000, dSF1, en-GB, Europe/Berlin, reduced motion, default Look. Password values are redacted in manifests and masked in screenshots; run only against fresh synthetic CI contexts, never personal provider settings. No golden update mode.

On CI, build the actual engines first, then install the locked Chromium and run the capture command on each source SHA.
Do not invoke update_snapshots, modify the Code snapshot thresholds or accept a migration just because screenshots exist.
Use `node scripts/compare-settings-captures.mjs BEFORE_DIR AFTER_DIR` for control/section inventory checking;
it ignores additive data-slot only. Then inspect actual before/after PNG pixels and run the named behavior gates.
Top/bottom captures are not complete continuous long-section coverage: capture middle/expanded/invalid states for the migrated controls.
Native Window, busy actions, real provider/IO flows and OS material require their own evidence.

## Stop conditions

A control's computed style differs, an existing locator/snapshot assertion would need weakening, a commit mode changes,
search/reset/undo scope changes, project overrides are lost, or unavailable/native behavior is misrepresented.
Split the patch and resolve it before proceeding. NativeSelect is the default; custom select conversion is not assumed.

Roadmap delta: P3 per-section plan, explicit real-app capture specs and structural comparator ready for CI.
No capture run, baseline approval or Settings rewrite has happened in this sandbox.

### Integrator CI recipe

Use separate fresh jobs/checkouts for before and after, same locked dependencies/engines/browser/runner.
Apply this capture-only harness to the pre-migration base too, without any migrating UI change.
After the production prerequisite steps used by `phase1-core-bootstrap.yml`, run from `phase1/`:

```sh
# Set by the job: before or after. GITHUB_SHA records the checked-out source.
SOMNIA_SETTINGS_CAPTURE=before npm run capture:settings
# Upload test-results/settings-migration/before as a named workflow artifact, always().
```

Use `after` in the candidate job; download both artifacts into separate directories and run:

```sh
node scripts/compare-settings-captures.mjs evidence/before evidence/after
```

Record reviewed screenshot pairs, source SHAs and behavior-gate results in the migration PR.
Do not commit these captures over existing snapshot goldens. The comparator rejects missing scheme manifests,
changed control contract and missing shot inventory. It is a fail-fast aid, not image matching.
Keep artifact upload on failure so partial screenshots explain the failed section.
