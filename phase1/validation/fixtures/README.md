PSD raw/rle/zip fixtures are independent hand-encoded 128x96 RGB8 planar
merged data (RGB 220,45,65). Hostile cases derive from that header: truncation,
section overrun, 33-layer count, zero dimensions, unsupported depth/mode and
oversized zipped output. no-merged resource 1057 explicitly says the merged
image is not real. psd-layers comes from craft/examples/psd_fixture.rs with
Unicode layer names and an explicitly supplied merged composite; it does not
prove Adobe-produced file compatibility or imported layer fidelity.
