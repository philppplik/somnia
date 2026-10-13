# Studio hero action: shared contract

Status: concept, no code. Review before development.

Today the header shows the same `Publish` button next to the Account pill in every studio (`PublishButton` in `App.tsx`). Publish deploys a web project over SSH/FTP, so it only makes sense for Code. In Photos, Slides and Design it is a dead end.

Idea: each studio declares one **hero action**, the primary thing a person finishes with in that studio. The slot, size and position stay identical everywhere. Only the label, icon and behaviour come from the studio.

## Contract

- One slot, left of the Account pill, where `PublishButton` is now. Same height (`h-8`), same radius, same place in every studio. The shell never asks "which studio is this?"; it reads the manifest.
- Manifest field (extends the planned Studio Manifest v2 `header` block in [studio-shell.md](studio-shell.md)):

```ts
header.heroAction?: {
  id: string;            // command id, must exist in the command registry
  labelKey: string;      // i18n key, 5 locales
  icon: string;          // Vadivam name
  menu?: string[];       // command ids for the split-button chevron (optional)
  when?: WhenExpr;       // same `when` language as rail items
}
```

- The button only calls `executeCommand(id)`. No studio logic in the shell. Disabled state follows the command's `enabled()`.
- Split button: main part runs the hero command, chevron opens a menu of related commands, last entry always `Publish...` (`deploy.open`, still in the Project menu and the palette).
- No manifest field means the old behaviour (Publish). Code and Sheets keep their current button until they get their own concept. Sheets (Smart Formula) and Code are outside this doc.
- Publish stays reachable everywhere: chevron menu, Project menu, `Mod+K`. Nothing is removed.
- Accessibility: label is the accessible name, tooltip shows label plus shortcut, focus order unchanged (Search, hero, Account).
- Width: icon plus label up to about 120 px; below the minimum window width (960 px) the label collapses to the icon with tooltip.

## What best-in-class apps do

Sources are help pages found via search; the pattern descriptions are my reading of them, not verbatim quotes.

| App | Primary top-bar action | Source |
| --- | --- | --- |
| Lightroom Classic | Export is a primary, always-available step at the end of the workflow, in the File menu and the Library bottom-left button | https://helpx.adobe.com/lightroom-classic/desktop/export-photos/exporting-photos-basic-workflow.html |
| Keynote | Play (present) in the toolbar, with Rehearse as a separate mode | https://support.apple.com/guide/keynote/present-on-your-mac-tan72233051/mac , https://support.apple.com/guide/keynote/rehearse-on-your-mac-tan1cb6ca7a3/mac |
| Figma | Share and a Present (play) control in the top right | https://help.figma.com/hc/en-us/articles/360040531773-Share-files-and-prototypes , https://help.figma.com/hc/en-us/articles/360040318013-Play-your-prototypes |
| Canva | Share plus Present at top right; download and export under Share | https://www.canva.com/help/presenting-designs/ , https://www.canva.com/help/download-or-purchase/ |
| Affinity Photo 2 | Export lives in its own persona/menu, not a toolbar hero | https://affinity.serif.com/en-us/learn/photo/desktop/quickstart/ |

Takeaway: the end-of-work action is a visible, named verb in the top right (Export, Present, Share). Pickers and format choices open from it instead of being buried in a panel.

## Order of work

1. Shell slot and manifest field (small, shared, once).
2. Photos (cheapest, every command exists).
3. Design (needs a PNG/PDF export decision).
4. Slides (needs a new presentation mode).

Studio docs: [hero-action-photos.md](hero-action-photos.md), [hero-action-slides.md](hero-action-slides.md), [hero-action-design.md](hero-action-design.md).
