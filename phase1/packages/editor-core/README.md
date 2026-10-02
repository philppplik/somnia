# Source-preserving editor core

Source text, not serialized DOM, is the stored document. parse5 supplies source locations for explicit elements only. Each operation patches a local range; comments, unedited whitespace, quote choice, scripts and unknown attributes outside that range stay byte-identical. Generated node IDs and layer metadata are separate from exported HTML.

Operations in one transaction are atomic. Origins suppress echoes; revision checks reject stale edits; listener reentry is blocked. Undo/redo shares snapshots across visual and code views. exportState/fromState preserve metadata and stable IDs for recovery, not disk-save status.

Limits are deliberately explicit:
- No visual edits to implied/omitted-tag containers or raw script/style content.
- Plain-text replacement refuses mixed markup. No silent flattening.
- Class-based visual styling appends an external rule, preserving authored CSS. Existing inline declarations must first be removed/edited in code. Rule reset and cascade-aware rule editing remain pending.
- Arbitrary source replacement may change IDs for a replaced opening tag; do not retain stale selection without checking it.
- Source patches are sequential within a transaction, not all relative to its original string.
- History restores exact text; no format-on-save is implicit.
