# Header hero actions

The header has one slot left of the Account pill. Until a studio defines its own action, the slot shows **Publish**, the website deploy button.

Status:

| Part | Status |
| --- | --- |
| The slot and the manifest field `heroAction`, with Publish as the fallback | **Pre-release** (studio shell, 12.2 line) |
| Per-studio actions in the table below | **In development** until their release notes say otherwise |

The slot is a split button. The main part runs the studio's primary command. The chevron opens extra commands. `Publish...` is always the last entry, so deploy is never lost. Below 960 px width only the icon shows. Off desktop (web build) the Publish entry is disabled.

## Planned action per studio

| Studio | Action | Concept |
| --- | --- | --- |
| Code | Preview | [hero-action-code](../concepts/hero-action-code.md) |
| Documents | Export (.docx copy first; PDF only once verified) | [hero-action-documents](../concepts/hero-action-documents.md) |
| Sheets | Smart Formula (local helper, not cloud AI) | [hero-action-sheets](../concepts/hero-action-sheets.md) |
| Slides | Present | [hero-action-slides](../concepts/hero-action-slides.md) |
| Sound | Export audio... | [hero-action-sound](../concepts/hero-action-sound.md) |
| Video | Export video... | [hero-action-video](../concepts/hero-action-video.md) |
| Design | Export | [hero-action-design](../concepts/hero-action-design.md) |
| Vector | Export... | [hero-action-vector](../concepts/hero-action-vector.md) |
| Photos | Export | [hero-action-photos](../concepts/hero-action-photos.md) |
| Vibe Space | New Studio... (New space... when none is selected) | [hero-action-vibespace](../concepts/hero-action-vibespace.md) |

Contract and rules: [hero-action-shell-contract](../concepts/hero-action-shell-contract.md). Developer reference: [header-hero-action](../studios/header-hero-action.md).

Check this table against the release notes before you rely on a row.
