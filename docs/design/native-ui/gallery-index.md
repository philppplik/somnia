# Component gallery index

Run `npm run dev:ds` inside `phase1`, then open `/test/design-system/?view=index`. No new dependency, app engines or user file access is required. Fixtures use production components and styles with synthetic state. They are interaction examples, not claims of complete studio fidelity.

| Local page | Components and checks | Source |
| --- | --- | --- |
| Default `/test/design-system/` | Field, native controls, NumberField, RangeField, panels, Notice, menus, popovers, tooltips, exchange/importer, studio adapters and shell states | `phase1/test/design-system/gallery.tsx` |
| `?view=studios` | InspectorNumberField, InterfaceField, PanelSection, StudioProgress, ReplaceSceneDialog, primary action | `studio-adoption-proof.tsx` |
| `?view=shell` | StudioEmptyState, StudioStatus, StudioRecentList; synthetic recovery error and intake failure | `shell-state-proof.tsx` |
| `?view=importer` | ThemeImportPanel preview, unsupported data, advisory warnings, Apply/Undo/Reset | `ThemeImportPanel.tsx` |

Relative source names in this table are under `phase1/test/design-system/` unless otherwise stated. ThemeImportPanel lives under `phase1/src/components/`. The integrated P9 `?focus-audit` route isolates tabs/dialogs; see the [keyboard checklist](a11y-checklist.md).

The default page keeps primitive pointer targets above the fold. Large studio/shell fixtures follow them. The standalone shell page includes its assertive recovery example; default combined page omits that extra unsolicited alert, while real simulated intake errors still announce normally. Existing assertion bodies are unchanged. This isolates independent fixture announcements, not production semantics.

Run `npm run test:ds:parity` for all isolated cases. Use `npm run test:ds:unit` for primitive render tests and `npm run check:ds` for the source/hook ratchet. Do not replace actual app/engine CI or native accessibility review with gallery results.

## Studio presentation recipes

Examples below use illustrative caller variables and translated strings. The primitives do not create commands, jobs, storage or permissions. Import from the corresponding module under `phase1/src/components/`.

### StudioProgress

```tsx
import {StudioProgress} from './studios/StudioProgress';
{job && <StudioProgress label={t('export.running')}
  value={job.completed} max={job.total}
  onCancel={job.cancel} cancelLabel={t('export.cancel')}/>}
```

Omit `value` for indeterminate progress. A nonpositive/invalid max normalizes to 1; finite values clamp to the valid range. Cancel appears only when both a real callback and label are present. Completion/removal is caller-owned. Do not show fake cancel for Photos/Interface operations without cancellation support. Label, live status and progress name must reflect real work, not a timer. Keep safe child details short.

### StudioEmptyState

```tsx
import {StudioEmptyState} from './studios/StudioEmptyState';
<StudioEmptyState studio="photos" icon={<PhotoIcon/>}
  language={locale} copy={localizedStarterCopy}
  onOpen={openPhoto} openTestId="photos-open"/>
```

Use a supported StarterStudioId. Only pass `onCreate` and localized `createLabel` when a blank-project capability exists. Await actual intake; the component disables its actions while pending and catches errors. Supply safe user-readable errors from the caller, not provider secrets or raw debug payloads. Test IDs and source actions belong to the consumer.

### StudioStatus and StudioRecentList

```tsx
import {StudioStatus} from './studios/StudioStatus';
import {StudioRecentList} from './studios/StudioRecentList';
<StudioStatus live="polite">{safeStatusText}</StudioStatus>
<StudioRecentList title={t('recent.title')} entries={recentEntries}
  onOpen={openRecentById} compact/>
```

Status is an inline span, not a timer/toast. `live="off"` is silent; assertive uses alert and should be reserved for interruption-worthy errors. Recent entries are `{id,label,metadata,testId?}`. An empty list renders nothing. Storage, timestamps, availability validation and opening stay with the studio. Do not make stale metadata a current availability claim.

### Panels and selection-scoped fields

```tsx
import {PanelHeader,PanelSection,PropertyList} from './ui/panel';
import {InspectorNumberField} from './studios/InspectorNumberField';
<PanelHeader><h3>{t('properties.title')}</h3></PanelHeader>
<PanelSection id="selection-layout" title={t('layout.title')}
  open={layoutOpen} onOpenChange={setLayoutOpen}>
  <InspectorNumberField label={t('position.x')} value={selection.x}
    min={-100} max={100} step={0.1} resetKey={selection.id}
    disabled={locked} onCommit={commitPositionX}/>
  <PropertyList rows={metadataRows}/>
</PanelSection>
```

PanelBody is also available for a simple padded body. IDs must be unique across mounted consumers. Collapse/persistence and domain transactions stay outside the panel. InspectorNumberField rejects invalid/empty values, deduplicates unchanged commits and uses NumberField's Enter/blur/Escape behavior. Reset by selection identity, not only displayed value. Use InterfaceField only at its existing studio boundary; it is not a generic engine command.

### ThemeImportPanel

```tsx
import {ThemeImportPanel} from './ThemeImportPanel';
import {installImportedTheme} from '../lib/importedTheme';
// Once during the shell's appearance setup, not each render:
installImportedTheme();
// In the appearance panel:
<ThemeImportPanel/>
```

No props or network-fetch authority. It reads bounded local JSON/CSS as inert data, shows ignored fields, previews and checks supplied color pairs. Apply persists the recognized theme in this browser and does not silently repair low contrast. Undo restores the previous imported state; Reset removes it. Saved seed/radii stay separate. See [theme author guide](theme-author-guide.md) and [importer guide](theme-importer-guide.md) before using imported colors.

## Shell-owned components

StudioPill and StudioViewMenu depend on the live studio registry/store and request handlers; StudioGlyph is the small icon adapter. Keep their real app CI coverage rather than creating a fake registry in the isolated gallery. StudioPill is a radiogroup, not document tabs. ReplaceSceneDialog uses the safe Cancel action, accessible title/body and caller confirm/cancel handlers; the fixture's confirm records a synthetic event only. Neither wrapper owns document replacement or export.
