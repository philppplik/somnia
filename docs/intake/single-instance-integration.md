# Single-instance integration (12.0.1)

## Toolchains and dependency verification

The repository toolchain is pinned to Rust 1.95.0. The desktop package declares
Rust 1.90 as its minimum supported Rust version. The release profile still uses
`panic = "abort"`.

`tauri-plugin-single-instance` is an optional desktop dependency pinned exactly
to `=2.5.0`. Its published Cargo manifest declares edition 2024, Rust 1.90 and
Tauri ^2.12. The crates.io API reported that this version was not yanked.
The lockfile records checksum
`8bed24ed0f31939002fad4568e04ba87ba717cd22f85318b867fc427ab88e11b`.

Verification sources:

- https://crates.io/api/v1/crates/tauri-plugin-single-instance/2.5.0
- https://crates.io/api/v1/crates/tauri-plugin-single-instance/2.5.0/download
- https://raw.githubusercontent.com/tauri-apps/plugins-workspace/a2364a5f216324439feedeb25b2db74e7b1eba90/plugins/single-instance/src/lib.rs
- https://raw.githubusercontent.com/tauri-apps/plugins-workspace/a2364a5f216324439feedeb25b2db74e7b1eba90/Cargo.toml

The published `src/lib.rs` matches that upstream release commit byte-for-byte.
The current upstream `v2` branch advertises 2.5.3. Its callback documentation
uses lossy `args_os` conversion; the pinned 2.5.0 documents `std::env::args`.
The exact pin is intentional, not a claim that it includes newer fixes.
Invalid-Unicode process arguments may therefore fail inside the pinned plugin
before the application callback. Application-side panic-free handling cannot
repair a panic inside that dependency. Test this explicitly on supported OSes.

`folder-lock-interim = []` is available but is not enabled by default. Its
implementation belongs to the file-identity lock package.

## CI insertion point

Run this gate in the existing desktop-native dependency setup, before release
packaging. Add it through the workflow integrator, not a competing workflow edit:

```yaml
- uses: dtolnay/rust-toolchain@1.90.0
- name: Desktop MSRV check
  run: cargo +1.90.0 check --manifest-path phase1/src-tauri/Cargo.toml --locked
- uses: dtolnay/rust-toolchain@1.95.0
- name: Desktop build
  run: cargo +1.95.0 build --manifest-path phase1/src-tauri/Cargo.toml --locked
```

Do not treat `--no-default-features` as a desktop-plugin compile check: it does
not compile the optional plugin or Tauri window glue.
