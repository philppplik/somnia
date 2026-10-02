# ADR 001: Phase 1 - desktop foundation and reliable editor core
Date: 2026-10-02
Status: accepted for this development block

The concept has two numbering systems: 12-roadmap/16-ai-dev-playbook define Phase 1 as Core WYSIWYG; VIBE_CODING_PLAYBOOK defines Step 01 as App Shell. This repository uses Phase 1 for the result-oriented block "Desktop foundation and reliable editor core". VIBE steps are work items, not competing product phases.

The existing proto/ and docs/ remain the live Phase-0 browser prototype. Phase 1 is isolated. No public deployment is implied by a green unit test or scaffold.

UI choice follows DESIGN_SYSTEM_DECISIONS (October 1): React 19, Base UI unstyled primitives, reshaped shadcn structural sources and Somnia-owned tokens. Never import a whole styled UI kit. Native shell is Tauri 2/Rust. Verify versions against live documentation/package metadata, not concept version snippets.

Source files are primary. parse5 projects browser-compatible structure and source ranges; canvas operations edit only those source ranges, never serialize the whole document. Unsupported or ambiguous content must refuse safely. Stable IDs live outside exported HTML. Transactions carry origins; subscribers do not receive their own echo. History is shared across views.

Save state must distinguish memory edits, recovery cache and successful disk writes. No account/AI/network is needed for editing. Preview scripts are disabled and project content never receives privileged desktop capabilities.

Deliverable is a tested development foundation. AI, full framework support, hosting, billing, marketplace and collaboration are out of scope. Multi-select/resize/spacing/richtext/color enhancements follow the reliable source/save core, not precede it.
