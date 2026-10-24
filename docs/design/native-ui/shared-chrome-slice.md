# Shared chrome slice 1

Small routing adoption only, with geometry intentionally unchanged:
MenuBar, HeroActionSlot and StudioViewMenu use the shared ChromeMenu compound facade.
Every primitive part retains identity, portal/positioner nesting, classes and existing behavior.
SaveDialog checkbox and OpenStudioDialog select use bare native wrappers; no new label/height/transaction policy.
Save/Close already use shared ConfirmShell, Dialog and Button. Do not pretend another wrapper change
is needed to make them shared. ConfirmShell busy guards/close button and footer measurement are unchanged.

Local tests prove facade identity and native markup parity; the existing isolated menu keyboard/collision gates remain.
Real app chrome capture starter and save-close-dialogs/close-dialog/router/menu-submenu suites are CI-only.
Before changing ConfirmShell geometry or replacing coordinate-owned context menus with Base UI,
obtain before/after focus/placement/disabled/cancel evidence. That broader change is not this slice.
No Settings rewrite, operation/disclosure change, threshold relaxation, new dependency or ratchet budget increase.
