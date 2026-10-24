# Photos pick / reject flags (P68)

Lightroom-style pick and reject flags, photos-only like the ratings:
the shared media model stays untouched.

## What changed

- `src/lib/photos/flags.ts`: a store keyed by media name, persisted to
  localStorage (`somnia.photos.flags.v1`). Values are `'pick'` or
  `'reject'`; clearing removes the entry so the map only holds flagged
  photos. `useFlag(name)` and `useFlags()` subscribe components;
  invalid values and empty names are ignored.
- Keyboard: in the workspace, `P` picks, `X` rejects and `U` unflags
  the active photo - same guards as the P66 keys (editable targets and
  Ctrl/Meta/Alt chords keep their keys).
- `PhotosFilmstrip.tsx`: flagged thumbs carry a flag badge on the left
  (accent for pick, danger for reject) next to the rating badge on the
  right. The filter select gains "Picked" and "Rejected" options; the
  stored filter value is normalized to a string so legacy numeric
  panel state keeps working.
- Unit tests pin validation, set/switch/clear, subscriber notification
  and the unflagged-reads-as-null contract; the gallery spec picks and
  rejects via the keyboard, narrows the strip by flag, and unflags, in
  light and dark.
