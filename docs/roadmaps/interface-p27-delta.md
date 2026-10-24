# Interface P27 delta

- Local component library polish:
  - Search/filter box over component and variant names (case-insensitive substring, 32-match cap) with an empty-state note.
  - "Where used" per component: instance counts grouped by page (ids capped at 8, counts exact).
  - Detach all: detaches every unlocked instance of the component in a single transaction (one undo); locked instances stay untouched; errors when nothing is detachable.
  - Update review: dry-run sync on an isolated copy lists instances carrying stale overrides or warnings after master edits (up to 8, with messages); the prune action drops overrides whose slot vanished from the current variant in one transaction, and reports when everything is in sync.
- Five locales via a P27 catalogue; DS Button/Field only; no new dependencies.
