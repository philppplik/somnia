# Interface Studio

Status: **In development.** Built on the `int/beta5` integration branch, not in a published release (latest pre-release is v12.2.0-beta.4). This page lists what is merged on `int/beta5` as of 2026-10-14. Each step is a bounded increment, not a Figma replacement.

Interface Studio is for screens, components and clickable prototypes. Design stays the page-layout studio.

## Start

Choose Interface in the studio pill. The header action is **Save**. Work is saved as a JSON snapshot you pick; without file access the studio downloads a copy and keeps the document marked as unsaved. Crash recovery keeps your last state locally. Interface does not claim `.fig`, `.somui` or `.somnia` ownership.

## Frames, pages and layout

- Frames with presets, multiple undoable pages, and import of PNG or JPEG into a frame (1 MB, 4096 px and 4 MP limits, stored as bounded PNG).
- Multi-select by modifier click, group move and arrow nudges, six align actions, equal-gap distribute.
- Auto layout: row and column stacks with gap, wrap, main-axis distribution and cross-axis gap. Grid with rows and column spans. Aspect-ratio lock. Live resize that shows child pin, stretch and scale before you commit. Flow versus absolute positioning per child.
- Responsive constraints with device presets, per-frame breakpoints with a preview switcher and a responsive issues review.

## Components and variants

- Master components and instances. Component swap, typed properties, variant axes (up to 8 properties and 50 values), per-property override reset, and variant rename and removal with axis cleanup.
- Library search, a usage list, detach all, and a review for stale overrides.
- A live component preview in the inspector.

## Design tokens and modes

- Variables with typed aliases, collections, and Light, Dark or Inherit modes per frame. A canvas mode preview shows each mode.
- Token export as CSS custom properties or JSON, and per-layer **Copy CSS**.

## Prototypes

- Click and hover links to a page root frame, an optional start frame, flow preview with scroll and sticky layers, overlay drawers, hover and pressed states.
- Transitions: timed fades, slide and push with easing and direction, smart-animate layer matching, and transition presets per link with hotspot highlight.
- Conditional transitions driven by variables, fixed setters, and a variable state panel in the preview.
- A shareable offline preview export.

Prototype runs are bounded: 100 activations and 50 back entries.

## Review and handoff

- Accessibility review: WCAG contrast with token fixes, tap target size, alt-text flags. Design lint with AAA reference, unlabeled interactive items and clipping, each with a one-undo quick fix.
- Dev Mode: measurement redlines, CSS, Tailwind-like and SwiftUI-like snippets (read them as starting points, not production code), and per-layer asset downloads.
- Export settings per layer (PNG, SVG or WebP at 1x or 2x; SVG is always 1x) and a document-wide asset export list of up to 64 entries.
- Frame export as SVG, PNG at 1x, 2x or 3x for 1 to 16 frames. Caps: 8192 px and 16 MP per frame, 32 MP per batch, 8 MB for SVG. A cancel button stops the export.

## Limits

- Not a full variant engine or prototype runtime. It does not generate production app code, and no import of other design formats is claimed.
- Hug text sizes are approximate and flagged as such.
- Local AI can write a frame annotation from structural metadata, and alt text for image fills. You review before after and accept. See [Local AI](../local-ai.md).

## Technical docs

[Concept](../../concepts/interface-design-studio.md), [format proposal](../../concepts/interface-document-format-proposal.md), roadmap deltas in [`docs/roadmaps/`](../../roadmaps/).

Back to [Studios](../studios.md).
