# Vendored GridCraft

`gridcraft/` is a full copy of [storytold/gridcraft](https://github.com/storytold/gridcraft)
at the pinned commit `fb823899c57b41703edcad2b6476cf4b8a01dfc4`, with our
`../upstream-wasm-clock.patch` applied (the only local change). Vendored on
2026-10-10 by owner decision so the build does not depend on the upstream
repo's availability.

Licence: MIT OR Apache-2.0 (copyright ArtCraft Team and the GridCraft
contributors) - see `gridcraft/LICENSE-MIT`, `gridcraft/LICENSE-APACHE` and
`gridcraft/NOTICE`. Attribution also lives in `../licenses/NOTICE`.

`../prepare-upstream.sh` stages this tree into `.upstream/` (the path the
crate's `Cargo.toml` references). To update the pin: clone upstream at the new
rev, re-apply `../upstream-wasm-clock.patch`, replace `gridcraft/`, and update
`REVISION`.
