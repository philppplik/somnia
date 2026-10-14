# Interface P56 Delta - Konturen (Stroke) komplett

- Panel: Kontur-Sektion fuer frame/group/rectangle/ellipse/line/path/image - Checkbox an/aus, Farbe (Color-Field) und Breite; setInterfaceStroke in editing.ts mit Validierung (Breite 1..64 ganzzahlig, Farbe #rrggbb, Text abgelehnt, locked/instance via patchInterfaceNode), Defaults aus DEFAULT_INTERFACE_STROKE in schema.ts; jede Aenderung eine Undo-Einheit.
- Canvas: frame/group/rectangle/image rendern die Kontur jetzt sichtbar als inset box-shadow (`inset 0 0 0 Npx color`, kombiniert mit bestehendem Schatten, keine Geometrie-Aenderung, folgt border-radius); ellipse/line/path stroken weiter nativ per SVG.
- Export: frame/rectangle/group/text/image mappen Stroke im CSS-Inspect als `border: Npx solid color` (vorher ungueltige SVG-Props auf HTML-Elementen); SVG-Export der rect/frame-Elemente traegt jetzt stroke/stroke-width Attribute; Vektor-Kinds unveraendert.
- i18n x5 (Kontur/Konturfarbe/Konturbreite u.a.), Tests: 4 Unit-Tests in p56Stroke.test.ts (Defaults/Update/Disable/Undo, Validierungsfehler, CSS-border vs SVG-stroke, i18n), Panel-Render EN/DE, CI-Spec `Interface P56 stroke outlines a rectangle with undo` (Checkbox, Breite 6, zweifaches Undo).
- Kein neues Third-Party-Dependency, kein FigCraft-Import, keine tokens.css/global.css-Aenderung, DS-Budgets unveraendert (kein neues Inline-Style/raw control im TSX).
