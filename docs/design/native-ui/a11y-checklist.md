# Keyboard and focus review

P9 audit: shared production wrappers and styles exercised in the isolated design-system gallery on int/beta5, 2026-10-14. This is not a whole-app, screen-reader or native-platform accessibility sign-off.

## Before merging a consumer

- Give every control an accessible name. Dialogs need Title and Description. Fields need a label, not just a placeholder. Check actual role/name relationships in the accessibility tree.
- Use Tab and Shift+Tab without a mouse. Keep focus visible and in view, including clipped panels, portals and narrow layouts. Use semantic `--focus-ring`, never remove the outline for styling. Check light/dark, standard/high contrast and custom/imported themes separately.
- Tabs have one roving tab stop. Shared TabsList uses Base UI's **manual activation** default: arrows/Home/End move focus; Enter/Space selects. Disabled tabs are arrow-focusable for discovery but must not activate. This differs from skipping disabled native buttons. If using `activateOnFocus`, test it explicitly and only use it when panel changes are immediate.
- Menus have one roving tab stop. Test arrows, Home/End, typeahead and disabled-item nonactivation. Disabled menu items are focusable; activation must do nothing. Escape closes without firing an action and returns focus to the trigger.
- Popovers must have a keyboard opening path and reachable content/close control. Check Escape and explicit Close return focus. Nonmodal popovers are not modal focus traps.
- Dialogs move focus inside, contain forward/backward Tab, support Escape when allowed and restore focus on closing. For controlled dialogs opened outside Dialog.Trigger, give `finalFocus` a stable connected ref. When the original control is removed, choose a logical replacement, not a stale element. Destructive dialogs should start on the safe action; test the real consumer.
- With `prefers-reduced-motion: reduce`, chrome animation and transitions stop, but open/close and return-focus still work. Do not tie cleanup or completion only to an animation event.
- Ensure disabled/read-only fields cannot commit an edit. Test keyboard commit, cancel and selection-change behavior in the consumer. Engine shortcuts must not intercept typing or overlay navigation.

## Regression evidence

`phase1/test/design-system/focus-audit.spec.ts` covers shared tabs' manual selection, roving indices and panel linkage; menu indices and ring; popover Close/Escape; modal Tab wrap in both directions, accessible title/description, Escape and stable-ref return-focus. Dialog/ring/motion tests run light/dark and standard/high contrast. `primitives.spec.ts` also covers menu arrows/typeahead/disabled actions, field editing, native checkboxes/radios and scale variations. `studio-adoption.spec.ts` covers the real 3D replacement-dialog adapter.

Run `npm run test:ds:parity`. No golden update is required by this audit. Actual app engines/E2E remain CI-only; run their consumer coverage there. Separately review native macOS/Windows, assistive technology, RTL/vertical tabs, nested overlays, removed triggers, forced colors and contrast against arbitrary imported themes. A computed outline width or static screenshot does not establish all of those properties.
