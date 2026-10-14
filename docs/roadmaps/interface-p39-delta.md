# Interface P39 - Delta

## Was
Ebenen-Kommentare fuer den Review-Modus im Interface-Studio.

## Warum diese Luecke
Vor P39 existierten nur ein einzelner `annotation`-String pro Frame und ein
`ready`-Flag. Varianten-Props mit Typbindung und Export-Slicing-Presets waren
bereits vorhanden (variantProperties, exportSettingsCore). Kommentare waren
die echte Luecke.

## Umfang
- `schema.ts`: `InterfaceComment {id,nodeId,text,createdAt,resolved?}`,
  Dokumentfeld `comments?`.
- `commentsCore.ts` (neu): `validateInterfaceComments` - max. 500 Kommentare,
  Text <= 2000 Zeichen, id/nodeId-Format, verwaiste nodeIds toleriert; in
  `validateInterfaceFeatures` verdrahtet (validation.ts).
- `comments.ts` (neu): `addInterfaceComment`, `setInterfaceCommentResolved`,
  `removeInterfaceComment` (loescht leeres Array), `interfaceComments`
  (Filter offen/erledigt/alle, neueste zuerst, Layername/Aufloesung).
- `InterfacePanels.tsx`: Sektion "Comments" im Inspektor - Filter
  (NativeSelect), Kommentarliste (Layer-Sprung, Text, Erledigt-Checkbox,
  Loeschen), Hinzufuegen-Zeile fuer die Auswahl. Alles ueber DS-Primitives.
- i18n: 11 Keys in 5 Locales (p39I18n.ts).

## Tests
- p39Comments.test.ts: 4 Tests (Hinzufuegen/Erledigen/Loeschen mit je einem
  Undo, Validierung fail-closed, verwaiste Kommentare nach Layer-Loeschen,
  Obergrenze, Sortierung/Filter).
- InterfacePanels.test.tsx: Render-Test EN/DE.
- interface-studio.spec.ts (CI-only): End-to-End Add/Resolve/Filter/Delete
  mit Undo/Redo.
- Fokussierte Suite: 372 gruen; check:ds, check:ui-commands, check:commands,
  check:layers gruen; tsc ungefiltert sauber.

## Basis
Basiert auf int/beta5 @ 641937e8 (P38 integriert als acc20d7f). Patch per
`git am` in frischem Worktree auf diesem Stand verifiziert.
