# Interface P55 Delta - Marquee-Mehrfachauswahl

- Drag auf leerer Canvas-Flaeche zieht ein Auswahlrechteck (gestrichelter Accent-Rahmen + Tint, aria-label lokalisiert); loslassen selektiert alle schneidenden Top-Level-Layer der Seite in Baumreihenfolge (hidden/locked ausgenommen), Shift/Ctrl/Mod zieht additiv.
- `interfaceMarqueeSelect` (editing.ts): normalisiert das Rechteck, schneidet computed Layout-Bounds der Page-Kinder, wirft bei unbekannter Seite; `interfaceMarqueeStyle` liefert die Overlay-Styles aus der Lib (DS-Ratchet: kein weiteres Inline-Style-Objekt im TSX, Budget bleibt 14).
- Klick ohne Ziehen (<2px) auf leerer Flaeche loest die Auswahl auf; Node-Drag, Resize, Pen-Tool und Prototype-Preview unberuehrt (stopPropagation/preview-Guard).
- Auswahl ersetzt standardmaessig, additive Auswahl vereinigt mit bestehender; Live-Region zaehlt weiter mit.
- Tests: 4 Unit-Tests in `p55Marquee.test.ts` (Reihenfolge/Normalisierung, hidden/locked/Page-Fehler, Style-Normalisierung, i18n x5), CI-Spec `Interface P55 marquee selects top-level layers only` (2 Root-Frames selektiert, verschachteltes Rechteck nicht, Klick auf Leerflaeche deselektiert).
- Kein neues Third-Party-Dependency, kein FigCraft-Import, keine tokens.css/global.css-Aenderung.
