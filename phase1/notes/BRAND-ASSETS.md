# Brand assets

Source: Philipp's WhatsApp, October 3, 2026 (new logo, silver S-swirl on a starfield, plus a black-on-transparent version for the UI).

- App icon: `src-tauri/icons/` (icon.png, icon.ico, icon.icns, 32x32, 128x128, 128x128@2x), generated with `tauri icon` from the starfield logo cropped to a rounded square (corner radius about 22% of the side). Browser favicon: `public/favicon.png`.
- In-app mark: `src/assets/logo-mark.svg`, the vector logo Philipp mailed (icon-logo.svg). It is drawn with a CSS mask in the top bar and filled with the `ink` token, so it is black in the light theme and white in the dark theme with no second asset.
- App icon source is Philipp's 1000 px somnia-logo.png (mailed Oct 3), rounded to 22% corners. The SVG is the definitive in-app source; no raster mask any more.
- Regenerate the icon set: `npx tauri icon <rounded png> -o /tmp/out` and copy icon.png, icon.ico, icon.icns, 32x32.png, 128x128.png, 128x128@2x.png into `src-tauri/icons/`.
