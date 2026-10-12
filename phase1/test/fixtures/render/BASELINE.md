# Initial baseline record

- Base commit: `87e7e69` (12.2.0-alpha.5).
- Initial references generated on Linux using Playwright 1.63.0 and its Chromium 153.0.8010.12.
- 32 fixtures x 2 viewports = 64 PNGs.
- Each test compared two fresh sandboxed srcDoc builds byte-for-byte.
- A separate comparison-only run passed all 64 cases after generation.
- All 64 PNGs visually inspected in four contact sheets: page content, layouts, form states, imported CSS, loaded SVGs, linked-script output, reveal visibility and responsive changes.
- The fixed flex-row fixture deliberately retains one row at mobile width to stress narrow flex items. Overflow/scroll fixture deliberately clips scrollable content.
- This is the initial reference set, not approval of any later visual change. Later replacements require the receipt workflow in README.md.
