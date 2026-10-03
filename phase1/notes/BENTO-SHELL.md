# Bento shell (design steering from Philipp, 2026-10-03)

Reference: dark calendar UI with rounded columns and a slightly darker background around them. Somnia keeps Light as default and gets the same layout in both themes.

- Tokens (tokens.css): `--shell-bg` (outer, darker than panels), `--radius-lg/md/sm` (22/14/10px), `--gap` (12px), `--card-shadow`.
- Layout (bento.css): titlebar, command bar, layers, canvas, inspector and status bar are separate rounded cards on `--shell-bg`. Resize handles are 12px gap columns with a thin accent grip on hover.
- No component logic changed. 25 Chromium tests pass; screenshots checked in light and dark.

## Stack
React 19 + Base UI (unstyled primitives) with shadcn-style component structure (src/components/ui, MIT license note in THIRD_PARTY_SHADCN_LICENSE.md) and plain CSS variables. Tailwind 4 is installed as a Vite plugin and imported in global.css, but the UI is styled with hand-written CSS, not Tailwind utility classes.

## Next
Custom window titlebar replacing the native Windows one (separate PR).
