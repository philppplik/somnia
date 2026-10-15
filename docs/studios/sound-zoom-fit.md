# Sound - Zoom to fit (Stage H3)

One click zooms back out to the whole session.

## What it does

- A Fit button next to the zoom slider resets the zoom to 1x (the full session span) and scrolls the lanes back to the start. Disabled when already fitted.

## Files

- `src/components/sound/SoundArrange.tsx` - button.
- `src/locales/sound/*.json` - `sound.arrange.fit` / `fitHint` in all 5 locales.

## Test

- View-state only; the suite passes unchanged.
