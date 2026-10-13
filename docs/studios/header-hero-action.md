# Header hero action (studio shell)

One slot in the header, left of the Account pill, where the Publish button used to be the only occupant. A studio can declare one primary action for that slot as data. Concept and rationale: [hero-action-shell-contract.md](../concepts/hero-action-shell-contract.md).

## Manifest

`StudioDef.shell.header.heroAction` (type `HeroActionDef` in `phase1/src/lib/shell/types.ts`):

| Field | Meaning |
| --- | --- |
| `id` | Command id from the command registry. The button only calls `executeCommand(id)`. |
| `labelKey` | i18n key for the label. The label is the accessible name. |
| `icon` | Rail icon name (`phase1/src/lib/shell/railIcons.ts`). Unknown names get the fallback glyph. |
| `menu` | Optional command ids for the split-button chevron, in order. |
| `when` | Optional `when` expression over the studio context (same language as rail items). |

Example (a studio manifest):

```ts
shell:{ ..., header:{ menus:['View','Help'], views:[], heroAction:{ id:'slides.present', labelKey:'hero.slides.present', icon:'Play', menu:['slides.rehearse'] } } }
```

## Behaviour

- No `heroAction`: the old Publish button, unchanged. Every shipped studio is in this state until it gets its own hero.
- Fallback to Publish also applies when `when` is false or invalid, when the hero command is not registered, or when the hero id is `deploy.open`.
- Split button: the main part runs the hero command and is disabled when the command's `enabled()` is false. The chevron opens `menu`. Unregistered menu ids, duplicates and the hero id are dropped. `Publish...` (`deploy.open`) is always the last entry, below a separator. It is still in the Project menu and the palette.
- Off desktop (web build) Publish cannot run. The Publish entry is then disabled, and the chevron is hidden when `menu` has no other entries.
- A running publish or rollback stays visible: the chevron shows a spinner, its accessible name adds "Publishing...", the Publish entry reads "Publishing..." with a spinner, and a screen-reader status region announces it. Choosing the entry opens the Publish panel with the live progress.
- The tooltip shows the label plus the command's shortcut. Focus order is unchanged. Below 960 px viewport width the label hides and the icon remains.

## Where things live

| Piece | File |
| --- | --- |
| Resolution (pure, no UI) | `phase1/src/lib/shell/heroAction.ts` |
| Slot component | `phase1/src/components/shell/HeroActionSlot.tsx`, mounted once in `App.tsx` |
| Tests | `phase1/src/lib/shell/heroAction.test.ts`, `phase1/src/components/studios/HeroActionSlot.test.tsx` |
| String `hero.more` ("More actions", 5 locales) | `phase1/src/locales/*.json` |

Studios add their own label strings in their own locale files. Shared JSX never branches on a studio id; a test enforces this.
