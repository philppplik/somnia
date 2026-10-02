# Somnia editor polish direction

## Browser file access
MDN marks showOpenFilePicker as limited availability and secure-context-only. Do not claim the File System Access API was enabled in browsers that do not implement it. Use feature detection. Fallback: explicit native file input for opening copies, source ZIP download for saving/export. State plainly that this does not save back to the original folder or provide native autosave. Treat download as requested, not proof that the user saved it.

Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
Compatibility source: https://caniuse.com/mdn-api_window_showopenfilepicker

## Design judgment
Linear's desktop redesign reduces visual noise, aligns sidebar/header/panels and strengthens hierarchy without sacrificing information density. This is a 2024 foundational reference, not a claimed 2026 trend. Its later Liquid Glass discussion rejects refraction for dense professional UI because it harms readability. Use restrained depth and legible surfaces, not a glass effect across a code editor.

Sources:
- https://linear.app/now/how-we-redesigned-the-linear-ui
- https://linear.app/now/linear-liquid-glass
- https://linear.app/changelog/2025-10-16-mobile-app-redesign

For Somnia: visible theme affordance rather than palette-only discovery; aligned controls and subdued panel chrome; contextual selected-layer actions; truthful source/disk/download status; no hero animations in the tool workspace. Preserve focus rings, reduced motion, keyboard commands and high-density editing. These are recommendations, not all implemented.

## Target uncertainty
Live https://somnia.philipp-paulik.de/ calls itself the Phase 0 visual web editor prototype. The new Phase1 code is private, not that live editor. Parent must reconcile which surface receives the user's fast fix before any Phase0 write. Current boundary prohibits main/docs/proto and live changes.
