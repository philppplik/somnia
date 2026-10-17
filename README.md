# Somnia site

Static landing page for https://somnia.philipp-paulik.de, served by GitHub Pages from this branch (`gh-pages`, branch root).

- Plain HTML, CSS and a small JS file. No framework, no build step, no cookies, no analytics, no third-party requests.
- The only network call from the page is the public GitHub releases list, which fills the download section with the real latest assets.
- Fonts: Inter and Inter Display (SIL OFL, `assets/fonts/OFL.txt`), subset to Latin. Icons: Vadivam (MIT). Key art and launch card: the Somnia design pack.
- Screenshots on the page are real captures, captioned with their source and version.
- `privacy/` and `datenschutz/` carry the existing policy text unchanged (the Microsoft Store listing links to `/privacy/`).
- Preview locally: `python3 -m http.server` in this folder.

The app lives on `main`. Do not merge this branch into `main`.
