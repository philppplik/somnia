# Brand assets

Source: Philipp's WhatsApp, October 3, 2026 (new logo, silver S-swirl on a starfield, plus a black-on-transparent version for the UI).

- App icon: `src-tauri/icons/` (icon.png, icon.ico, icon.icns, 32x32, 128x128, 128x128@2x), generated with `tauri icon` from the starfield logo cropped to a rounded square (corner radius about 22% of the side). Browser favicon: `public/favicon.png`.
- In-app mark: `src/assets/logo-mark.png`, alpha mask derived from the black logo. It is drawn with a CSS mask in the top bar and filled with the `ink` token, so it is black in the light theme and white in the dark theme with no second asset.
- The delivered black logo was a 250 px JPEG without real transparency, so the mask is a little soft at large sizes. A vector or larger transparent PNG from Philipp would replace `logo-mark.png` without code changes.
- Regenerate the icon set: `npx tauri icon <1024px png> -o /tmp/out` and copy icon.png, icon.ico, icon.icns, 32x32.png, 128x128.png, 128x128@2x.png into `src-tauri/icons/`.
