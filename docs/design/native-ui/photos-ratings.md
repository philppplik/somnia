# Photos star ratings (P63)

Lightroom-style 0-5 star ratings for the library, photos-only: the
shared media model (`MediaItem`) stays untouched.

## What changed

- `src/lib/photos/ratings.ts`: a tiny store keyed by media name,
  persisted to localStorage (`somnia.photos.ratings.v1`). Ratings are
  integers 0-5; 0 clears the entry so the map only holds rated
  photos. `useRating(name)` and `useRatings()` subscribe components;
  invalid values and empty names are ignored.
- `RatingStars.tsx`: five star buttons for one photo. Clicking star n
  rates n; clicking the current rating clears it (standard toggle-off).
  Filled stars render in the accent colour.
- `PhotosFilmstrip.tsx`: the strip gains the active photo's
  `RatingStars`, a rating badge on every rated thumbnail, and a filter
  select (All / at least n stars, panel-persisted
  `photos.ratingFilter`). The filter narrows the visible thumbs but
  never hides the strip itself - the null check still counts the
  unfiltered library.
- `InfoPanel.tsx`: a rating row with the same `RatingStars` control.
- Unit tests pin validation, set/overwrite/clear, subscriber
  notification and the unrated-reads-as-0 contract; the gallery spec
  rates a photo, checks the badge, narrows the strip with the filter,
  reloads to prove persistence and clears by re-clicking, in light and
  dark.
