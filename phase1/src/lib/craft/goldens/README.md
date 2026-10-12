# Raster goldens (engine hardening 3.5)

Reference PNGs in `png/` for the TS reference renderer (`src/lib/image`) and the craft padding pipeline, compared at 1/255 per channel. Run: `npm run test:goldens`.

- Update after an intended pixel change: `UPDATE_GOLDENS=1 npm run test:goldens`, review the PNG diff, commit.
- `craft-wasm-*` tests skip until `craft/build.sh` has produced `craft/pkg/somnia_craft.js` + `.wasm`. On first run with the build present, generate the golden with `UPDATE_GOLDENS=1` once and commit it; after that the test enforces it.
- Fixtures are integer-formula images in `golden.ts`, no RNG.
