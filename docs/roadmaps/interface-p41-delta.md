# Interface P41 - Delta

## Was
Baseline-Ausrichtung fuer horizontale Auto-Layouts im Interface-Studio.

## Warum diese Luecke
Recon vor dem Bau: Accessibility-Audit deckt bereits Kontrast (WCAG AA/AAA
mit Token-Vorschlaegen), Tap-Targets, Alt-Texte, Labels, Overflow und
Text-Overflow ab. Tokens/Variablen haben Aliase, Collections, Modi und
Import/Export. Auto-Layout kannte start/center/end/stretch - Baseline,
der klassische fuenfte Modus fuer Textzeilen, fehlte.

## Umfang
- `schema.ts`: `align` um `'baseline'` erweitert.
- `layout.ts`: `baselineOffset` - Text nutzt 0.8 der Zeilenbox
  (text-before-edge Rendering), andere Ebenen richten ihre Unterkante aus;
  nur fuer `direction:'row'` aktiv, Spalten und Grid fallen auf Start
  zurueck.
- `validation.ts`: `'baseline'` in der Align-Enum.
- `devMode.ts` / `export.ts` / `handoffSnippets.ts`: CSS-/Tailwind-Mapping
  (`items-baseline` / `align-items: baseline`).
- `InterfacePanels.tsx`: Baseline-Option im Alignment-Select nur bei
  Zeilen-Layouts.
- i18n: Key `interface.baseline` in 5 Locales (p41I18n.ts).

## Tests
- p41Baseline.test.ts: 4 Tests (Grundlinien zweier Textgroessen gleichen
  sich an, Rechteck-Unterkante auf der Grundlinie, Fallback in Spalten/Grid,
  Validierung fail-closed + ein Undo, Locale-Label).
- InterfacePanels.test.tsx: Render-Test EN/DE inkl. versteckter Option bei
  Spalten.
- interface-studio.spec.ts (CI-only): Row + Baseline setzen, ein Undo
  zurueck auf Start, Option bei Spalten nicht vorhanden.
- Fokussierte Suite: 383 gruen; check:ds, check:ui-commands, check:commands,
  check:layers gruen; tsc ungefiltert sauber.

## Basis
Basiert auf int/beta5 @ ddecbd06 (P39 integriert als d4a476bb). P40 ist zum
Zeitpunkt des Reports noch nicht integriert; der P41-Patch stapelt auf dem
P40-Commit (1ae651e9) und wurde als git-am-Sequenz P40+P41 auf ddecbd06
verifiziert.
