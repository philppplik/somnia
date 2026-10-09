# License scope

DeckCraft core: MIT OR Apache-2.0, retaining both upstream texts, copyright,
NOTICE and ATTRIBUTION. A MIT selection is available for Somnia's MIT product.
All spike-authored source, demo and fixture content: MIT OR Apache-2.0.
ArtCraft marks are NOT licensed for a Somnia fork and are not bundled here.

This bundle compiles model/geom/color/fonts/text/render/pptx, not UI, engine,
PDF or media. No Symphonia/MPL or video-codec obligation applies to this tested
WASM target. Full-repo integration would have a different dependency surface.

`dependency-manifest.json` and `wasm-normal-build-dependencies.txt` inventory
normal/build dependencies for wasm32, including build-time procedural macros.
Dependency license files are copied without modification to dependencies/.
Some dependencies offer alternate licenses (including LGPL as an OPTION, not
mandatory). SPDX alternatives must be selected consistently before release.
Fonts have separate terms: this build includes Ubuntu Light fallback under UFL
1.0; UFL.txt and the other epaint font-license texts are retained here. It does
not embed craft-fonts. epaint_default_fonts has no root LICENSE file; its font
license texts are retained at this directory root.

This is a source-and-notice inspection, not legal advice or a provenance audit
of every contributor. Cargo metadata is self-reported; shipping review should
check embedded binary assets and chosen SPDX expressions as part of the
product SBOM. No third-party code was relicensed.

Somnia package 1 rebuild: current-dependency-manifest.json records the exact 100 packages resolved by its independent Cargo.lock; dependencies/ contains their root notice files. The older dependency-manifest.json is retained as spike provenance, not this build's SBOM. DeckCraft crates inherit root LICENSE-MIT, LICENSE-APACHE, NOTICE and ATTRIBUTION; epaint font terms remain in this directory.
