# Layer context menu

Feature branch: feature/layer-context-menu, based on combined Foundation8f20a05.

Base UI ContextMenu supplies right-click and Shift+F10 entry, portal placement, keyboard menu and Escape handling. Actions inspect, view source, move siblings, hide/show and lock/unlock. They use existing source/core transactions and shared undo. Metadata changes do not change authored HTML/CSS. Locked move actions disabled; core still validates ancestor locks. Right-click selects one layer explicitly. No duplicate/delete, filesystem effects or native-menu claims.

2026-10-02 local TypeScript/Vite build and all21 browser tests passed including right-click, Shift+F10, hide+undo, source unchanged, locked move disabled. Actual light screenshot inspected: menu readable, in viewport. Source dependency remains existing Base UI; no new packages. Native OS acceptance remains distinct.

Pending GitHub branch sync/CI/PR. Not in the Windows installer handed off earlier this evening. Canvas right-click is not implemented by this first scoped layer menu.
