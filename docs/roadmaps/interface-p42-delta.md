# Interface P42 - Delta

## Was
Zeichenabstand (letter-spacing) fuer Textstile im Interface-Studio.

## Warum diese Luecke
Freie Wahl. Recon: Textstile hatten Schriftgroesse, Zeilen hoehe, Staerke,
Schriftbreite und Absatzabstand (P34), aber keinen Zeichenabstand - die
einzige uebliche typografische Eigenschaft, die fehlte. Seiten-UI, Suche,
Aliase, Collections und Modi existieren bereits.

## Umfang
- `schema.ts`: `InterfaceTextStyle.letterSpacing?:number` (px, -32..64,
  negativ erlaubt; fehlt = normal).
- `tokens.ts`: Validierung der Grenzen, fail-closed.
- `export.ts`: SVG-Render (`letter-spacing`-Attribut), inspectInterfaceCSS
  und interfaceLayerCSS (`letter-spacing` in px).
- `handoffSnippets.ts`: `letter-spacing` im CSS-Handoff.
- `devMode.ts`: Tailwind (`tracking-[Npx]`) und SwiftUI (`.tracking(N)`).
- `InterfaceResources.tsx`: Zahlenfeld im Textstil-Editor, 0 entfernt die
  Eigenschaft.
- i18n: Key `interface.letterSpacing` in 5 Locales (p42I18n.ts).

## Tests
- p42LetterSpacing.test.ts: 2 Tests (SVG/CSS/Inspect/Tailwind/SwiftUI tragen
  den Abstand, negativ erlaubt, Entfernen sauber; Grenzen fail-closed + ein
  Undo).
- InterfacePanels.test.tsx: Render-Test EN/DE.
- interface-studio.spec.ts (CI-only): Textstil anlegen, Zeichenabstand
  setzen, ein Undo zurueck auf 0.
- Fokussierte Suite: 386 gruen; check:ds, check:ui-commands, check:commands,
  check:layers gruen; tsc ungefiltert sauber.

## Basis
Basiert auf int/beta5 @ FETCH_HEAD nach Integration von P40 (8092fad2) und
P41 (161e1367); Patch stapelt direkt auf dem Tip.
