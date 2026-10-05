# Component browser (search, tags, folders, previews, drag-insert)

Branch `comp/ux-search`, based on PR #109 (component system). Adds a "Browse components" section above the component manager in the Components panel.

## What it does
- **Search**: case-insensitive; every word must match the component name, a variant name, a tag or the folder. Name matches rank first.
- **Tags and folders**: "Organize" on a card sets one folder (max 40 chars) and up to 8 tags (max 24 chars each, lower-case, dashes). Filter chips combine with search.
- **Previews**: each card shows a thumbnail of the default variant in an iframe with `sandbox=""`, a restrictive CSP, scripts/event handlers/`javascript:` links stripped, and the current page's `<style>` blocks so it looks like the page. No pointer events.
- **Drag-insert**: drag a card onto a container in the canvas. Same rules as Insert: duplicate IDs are refused, instance marks are written, one Undo removes it.

## Design
- `src/lib/componentCatalog.ts`: pure logic (search, tags, folders, preview sanitising, drag payload). Unit tests in `componentCatalog.test.ts`.
- `src/lib/componentCatalogStore.ts`: storage and the drop insert.
- `src/components/ComponentBrowser.tsx`: UI.
- Metadata is stored under `somnia.components.meta.v1`, keyed by component id. The component format (`somnia.components.v2`) is unchanged. Metadata of deleted components is ignored on load.
- Shared-file edits: `ElementsPanel.tsx` (mounts the browser), `DesignCanvas.tsx` (accepts the new drag type next to the element drag).

## Limits and known gaps
- Thumbnails use only inline `<style>` of the page, not linked stylesheets (the sandbox blocks external loads). Tailwind CDN-style pages may show unstyled previews.
- The grid refreshes after library actions via the status notice; an action that sets no notice would not refresh until the next one.
- Metadata is per app profile, like the library.
- Strings are hardcoded English.
