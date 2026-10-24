# Interface P54 Delta - Gruppieren und Aufloesen

- `groupInterfaceSelection` / `ungroupInterfaceSelection` in `editing.ts`: Gruppieren legt ein `group`-Kind an der Position des ersten selektierten Geschwisters an, Bounding Box aus berechneten Layout-Grenzen, Kinder behalten Reihenfolge und werden auf relative Koordinaten umgestellt; Aufloesen loest die Gruppe in-place auf und stellt absolute Positionen wieder her. Beides eine Undo-Einheit, Auswahl folgt der Gruppe bzw. den freigegebenen Kindern.
- Canvas-Shortcuts Mod+G (gruppieren) und Mod+Shift+G (aufloesen) mit Fokus-Guard; Eintraege im Shortcuts-Cheatsheet (P53).
- Eigenschaften-Panel: Group-/Ungroup-Buttons neben Reihenfolge/Löschen (Ungroup nur aktiv bei ausgewaehlter Gruppe), Texte ueber i18n (5 Locales: EN/DE/FR/ES/JA).
- Guards: nur ungesperrte Free-Layout-Geschwister (gleiche `movableSelection`-Regeln wie Move); cross-parent/locked Auswahl wirft wie gehabt.
- Tests: 4 Unit-Tests in `p54Groups.test.ts` (BBox/Reihenfolge/relative Koordinaten/Undo, Ungroup-Rueckbau, Ablehnungsfaelle, i18n), Panel-Render-Test EN/DE, CI-Spec `Interface P54 groups two rectangles with one undo`.
- Kein neues Third-Party-Dependency, kein FigCraft-Import, keine tokens.css/global.css-Aenderung.
- Prototype-Verdrahtung: Gruppieren eines Flow-Startframes oder Link-Ziels entfernt diese Referenzen (Startpunkt/Links werden wie bei Loeschen aufgelöst, da Start/Ziel weiterhin Top-Level-Frames sein muessen); Undo stellt alles wieder her.
