# CA2 – Handoff-Runde 2 (Slides Bild → Photos, Audio → Sound, Palette)

Basis: `feat/interface-design-p23` (P57 → AE1 → CA1 → Sound-DS → CA2). Kein Merge nach main.

## Was neu ist
- **Slides-Bild → Photos:** Ein markiertes Bild in einer Folie bekommt in der Handoff-Zeile
  „In Photos bearbeiten". Das Bild landet als `picture - <name>.png` in der Photos-Ablage,
  dort erscheint eine ruhige Zeile mit „Zurück zu Slides". Der Rückweg legt das bearbeitete
  Bild als ausstehende Rückgabe ab; in Slides erscheint „Übernehmen" und ersetzt das Bild
  erst nach explizitem Klick (`replaceImage`).
- **Audio → Sound:** Die Inline-Audio-Vorschau zeigt dezent „In Sound öffnen"
  (`requestStudio('sound','manual')`), damit die volle Sound-Oberfläche einen Klick entfernt ist.
- **Palette:** Zwei neue Befehle – „Tabelle in Sheets öffnen" und „Bild in Photos öffnen"
  (aktiv nur bei passender Formauswahl in Slides). Registriert im Kommando-Dump, Titel in
  allen 5 Sprachen.
- **Registry reaktiv:** Der Handoff-Store liegt auf `globalThis` (Vite-Dev doppelt Module
  sonst) und benachrichtigt Abonnenten; Sheets-/Photos-Leisten und Slides-Handoffs
  abonnieren via `useSyncExternalStore`. Behebt eine echte Render-Race: Origin wurde nach
  dem Aktivierungs-Render gesetzt und die Leiste blieb unsichtbar.

## Dateien
- Neu: `handoff/open.ts` (geteilte Open-Helper), `handoff/commands.ts` (Palette),
  `PhotosHandoffBar.tsx`, `SlidesPictureHandoff.tsx`, Fixture `slides-engine/fixtures/picture.pptx`.
- Geändert: `deckPackage.ts` (`readPicture`), `registry.ts` (Payload-Union + globalThis + Subscribe),
  `MediaPreview.tsx` (AudioOpenHint), `PhotosWorkspace.tsx` (+`renderPhotoBytes`), Slides/Sheets-Handoffs
  auf `open.ts` umgestellt, i18n ×5, `tests/handoff-ca1.spec.ts` (+Bild- +Audio-Test),
  `test/handoff-preview.tsx` (Modi picture/audio), `docs/ui-commands.*`.

## Verifikation
- Unit: 397/397 grün (handoff, slides, photos, sheets, office).
- Pixel (isolierte Fixture, vite + playwright): Sheet- und Bild-Roundtrip hell/dunkel grün;
  Screenshots ca2-{light,dark}-{1..4}-*.png (Bild-Vorschlag, Photos-Leiste, Übernommen, Audio-Hinweis).
- `check:ui-commands`: nur bereits bekannter Bestand `photos.applyVersion` (upstream).
- `check:ds`: nur Sound-Budgets aus der Sound-DS-Migration (Integrator-owned).
- tsc --noEmit lokal übersprungen (Sandbox), CI übernimmt.

## Offen / Grenzen
- `photos.applyVersion`-Titel fehlt weiterhin (Bestand, nicht CA2).
- Sound-Budgets (pixelText/inlineStyle) warten auf Budget-Entscheid des DS-Owners.
- E2E der echten App läuft nur in CI; lokal isolierte Fixture-Verifikation.
