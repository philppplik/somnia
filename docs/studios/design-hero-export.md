# Design header export

The split header Export button opens a studio-owned popover. Choose current artboard (SVG) or all artboards (one SVG ZIP), review the output file name, then Export. A separate button downloads the editable `.somdesign` source. The split menu retains immediate SVG/source commands and the shared secondary Publish entry.

`design.export.open` is UI-only, enabled only with an open design and bound to `Mod+Shift+E`. Opening/closing setup never writes, switches artboards or changes undo/dirty state. Download initiation is reported as such, not proof that a browser download has been saved to disk. Errors stay inline. The all-artboards command serializes a snapshot without touching active selection; ZIP entries are numbered and path-safe even when board names repeat.

SVG is the only rendered format shipped here. PNG and PDF are absent, not disabled promises. The concept left packaging open; this implementation uses a single ZIP for every all-artboards request to avoid multiple-download browser permission prompts. This is a local, reversible packaging choice, not a new project format or native destination picker.

Validation: archive safety/content and immutability tests; empty/ready/UI-only setup command tests; actual SVG and ZIP browser downloads in light and dark. Native desktop downloads and Windows behavior remain unverified.

Roadmap-Delta: Design header Export setup and all-artboards SVG ZIP added; PNG/PDF remain outside this patch.
