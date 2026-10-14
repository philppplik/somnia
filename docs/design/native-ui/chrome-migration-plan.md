# P2 broader chrome migration plan

Preparation, not blanket migration permission. Base `int/beta5` 626bc7c8; Settings is separate P3.
Shared overlay primitives already exist. Preserve native controls/semantics, CSS scopes and class hooks,
portal z-order/placement, focus return and commit/pending/cancel semantics per consumer.

| Package | Surface inventory | Capture and behavioral gates | Checklist |
| --- | --- | --- | --- |
| Confirm chrome | ConfirmShell, SaveDialog, CloseDialog, CloseProjectDialog, CloseAllDialog | fresh synthetic save, busy, error; memory/disk close; save-close-dialogs.spec.ts, close-dialog.spec.ts | [ ] before [ ] migrate [ ] after |
| Project routing | NewProjectDialog, OpenStudioDialog, WelcomeDialog | invalid name, busy, empty/available studio, Escape/focus; router-dialog.spec.ts and SSR framework tests | [ ] before [ ] migrate [ ] after |
| Export/share | ExportDialog, ConvertDialog, PublishDialog, ShareDialog | review/error/pending, disabled target, consent; existing export/convert/publish/share tests | [ ] before [ ] migrate [ ] after |
| Document/version | DiskComparison, VariantsTab dialogs, PublicationReview | conflict/unmerged, busy cannot dismiss, no writes on capture | [ ] before [ ] migrate [ ] after |
| App menus | Header file/edit/view/insert menus, StudioViewMenu | all entries/submenus, checked/disabled, keyboard/typeahead, focus return; menu-submenus/insert-menu tests | [ ] before [ ] migrate [ ] after |
| Context menus | CanvasContextMenu, LayerContextMenu, code/project context menus | empty/single/multi-selection, coordinate collision, keyboard, disabled; existing context-menu specs | [ ] before [ ] migrate [ ] after |
| Feature output | sound/image/conversion/output reviews | pending/save failure/cancel and retained content, per-studio gates | [ ] before [ ] migrate [ ] after |
| Account/provider | Account, agent/provider overlays | synthetic fresh no secrets; security/consent semantics untouched | [ ] before [ ] migrate [ ] after |

## Capture approach

Real app CI-only starter: `npx playwright test --config test/chrome-migration/playwright.config.ts`.
`SOMNIA_CHROME_CAPTURE=before` / `after`, fixed viewport/fonts/default Look/en locale/reduced motion,
three modes. It captures safe Save idle/busy/error and memory/disk Close states without invoking any effect.
Artifacts: `test-results/chrome-migration/<label>/`; manifests record source SHA, dialog role, buttons/disabled.
No assertion threshold or golden update. Startup engines must be the real production prerequisites.

Extend by one consumer package with explicit trigger/setup and expected role/control inventory, not a generic
click-everything crawler. Menus need popup + trigger context, submenu-open, collision-edge and keyboard evidence;
never treat a screenshot-only disabled item as proof it cannot activate. Dialogs need focus-trap/return,
Escape/backdrop behavior, busy guard and middle/expanded content proof. Record aria relationships and hooks
before/after. Inspect actual PNG pixels on the same CI runner/browser/fonts. Existing behavioral tests remain required.
No generated captures are approved in this preparation. New studios have additive evidence, not permission to
weaken other studios' legacy baselines. Capture production secrets/accounts never; use synthetic CI contexts.
