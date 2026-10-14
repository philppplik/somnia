# Interface P40 - Delta

## Was
Export-Slices: optionaler Bildausschnitt (Region) pro Export-Einstellung im
Interface-Studio.

## Warum diese Luecke
Recon vor dem Bau: Keinerlei Slice-Konzept im Bestand - alle "slice"-Treffer
waren Array.slice. Varianten-Props-UI (P33 Matrix, typisierte Props) und
Prototyp-Interaktionen (click/hover/afterDelay/press, Overlay, Back,
Bedingungen, Smart Animate) waren bereits komplett. Export-Slicing war die
echte Luecke.

## Umfang
- `schema.ts`: `InterfaceExportSetting.region? {x,y,width,height}` in
  Ebenen-Koordinaten.
- `exportSettingsCore.ts`: `checkExportRegion` (Ganzzahlen, x/y>=0,
  1..8192), Dedupe-Schluessel inkl. Region (mehrere Slices gleichen
  Formats/Skalierung erlaubt), Region in ExportListEntry; keine
  undefined-Keys im Dokument.
- `export.ts`: `sliceInterfaceExportSVG` - schreibt den aeusseren Viewport
  des Layer-SVG auf die Region um; fail-closed wenn die Region die Ebene
  ueberschreitet.
- `exportSettings.ts`: Raster (PNG/WebP) und SVG laufen durch die Region;
  Dateinamen `name-slice-WxH[@2x].ext`.
- `InterfaceDevMode.tsx`: Slice-Feld pro Export-Einstellung ("x,y,w,h",
  leer = ganze Ebene), Fehlermeldung bei ungueltiger Eingabe, Marker
  "· slice WxH" in der Asset-Exportliste; Format-/Skalierungswechsel
  behalten die Region.
- i18n: 3 Keys in 5 Locales (p40I18n.ts).

## Tests
- p40Slice.test.ts: 5 Tests (Add/Update/Dedupe/Delete mit Undo, Validierung
  fail-closed, Viewport-Rewrite, Regionsgrenzen, SVG-Export mit Dateiname,
  Exportliste traegt Region).
- InterfacePanels.test.tsx: Render-Test EN/DE.
- interface-studio.spec.ts (CI-only): Slice setzen, Marker, Download-Name,
  Fehlerfall, ein Undo entfernt die Region.
- Fokussierte Suite: 378 gruen; check:ds, check:ui-commands, check:commands,
  check:layers gruen; tsc ungefiltert sauber.

## Basis
Basiert auf int/beta5 @ 3386e104 (P39 noch nicht integriert; Patch stapelt
auf diesem Tip, P39-Commit ca66affd liegt darunter).
