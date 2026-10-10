# Extension assets, pipeline 1

This crate is the byte-only asset converter. It does not install or publish an
extension and never loads publisher files by path. The package owner validates
archive entries, links, root containment and opened-file identity before sending
owned bytes. The schema validator is in `src/lib/extensions/assets/schema.ts`.
Execution API 1 is independent of package format 2 and asset schema 1.

## Integration contract

1. Parse the original JSON with `parseAssetJson` and validate it with
   `validateAssetManifest`, using `store` mode for publication. Preserve the exact
   original package bytes for hashing/signing. Do not hash the parsed JSON instead.
2. Resolve only declared sources from the validated package. Pass one `Source`
   per field, with a unique field identifier (`screenshots[0]`, `glyphs.check`,
   `icon@dark`, etc.), its role, path and immutable bytes. Check missing files.
3. Invoke the `somnia-extension-assets` executable in a separate nonprivileged,
   networkless process without host mounts, credentials or executable writable
   directories. Its stdin accepts one JSON object `{packageDigest, sources}`.
   Each source has `{field, path, role, bytes}`; bytes is a JSON byte array.
   The transport frame is capped at 100 MiB, independently of the 48 MiB decoded
   source budget. A too-large transport frame fails closed. A binary/base64
   envelope is a future compatibility change, not implemented implicitly here.
4. The supervisor must enforce 256 MiB memory, 5 seconds CPU/10 seconds wall per
   asset and 120 seconds per release. The executable itself is **not a sandbox**.
   It exits 0 with `{"Ok": inventory}`, 1 with `{"Err": diagnostics}`, or 2 for a
   bad/oversized transport frame. It has no filesystem or network operations.
5. Verify the immutable package digest against the original signed package and
   authenticate the inventory before passing handles to host chrome. Store
   `Derivative.bytes` under opaque digest keys. Never serve source SVG.
6. Stage all derivatives privately. Commit the package, inventory and new cache
   pointer in a single transaction only after complete validation and required
   review. Errors return no usable partial inventory. Previous installs/releases
   must remain unchanged. This converter is not proof of Store publication,
   ownership authorization, quarantine, moderation or serving readiness.

Identity PNG output preserves alpha, uses premultiplied Lanczos downsampling and
includes an sRGB chunk. Listing transparency is composited onto white. JPEG EXIF
orientation is applied before metadata is discarded. PNG output is reopened by
a different decoder and dimension/digest checked. Glyphs are raster-only white
masks. Top-level codecs are pinned to PNG/JPEG and restricted SVG; no browser,
ImageMagick, publisher code, font loading or remote resources are used.

ICC profiles are rejected in pipeline 1 rather than converted incorrectly. PNG
standard sRGB gamma is supported; unsupported profiles are fail-closed. Complete
ICC conversion remains a release blocker for claims of full asset-contract
compliance. PNG APNG, multi-image JPEG, trailing payload, wrong suffix/signature,
corrupt chunks and prohibited SVG are rejected.

## Presentation helpers

`presentation.ts` contains Unicode initials, smallest-sufficient DPR selection
and a bounded dark-to-normal failure state. `schema.ts` owns the exact 11-key
Vadivam registry. The Unicode fallback is MIT grapheme-splitter 1.0.4, pinned
Unicode 10; modern Intl.Segmenter uses the platform Unicode version. Native host
components, system-color/forced-color fallback, trusted raster transport and
visual control QA are integration work, not shipped by this converter crate.
No badge verification can be inferred from a publisher manifest or artwork.

## Validation

```
cargo test --locked --manifest-path extension-assets/Cargo.toml
npx tsx --test src/lib/extensions/assets/assets.test.ts
```

The dedicated workflow tests the converter and isolated TypeScript subset. It
does not enable Store publication or replace the full app's CI gate.
