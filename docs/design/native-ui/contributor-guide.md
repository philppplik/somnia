# Contributor guide: app UI

These are shell components, not reusable blocks inserted into a user's document.
Current APIs live in `phase1/src/components/ui/`; the isolated gallery is `phase1/test/design-system/`.
No Storybook dependency. `npm run dev:ds` starts the gallery; `npm run test:ds:unit` and
`npm run test:ds:parity` check it without running the app engines. Real app E2E remains a separate gate.

## Select the smallest wrapper

| Need | Module / choice | Caller responsibility |
| --- | --- | --- |
| Action | `button`, variants ghost/outline/primary; normal/icon/compact/tiny/row sizes | `type="button"` in forms, pending/disabled state, handler |
| Icon-only action | `icon-button`: required aria-label, icon/row sizes | translated meaningful name, not icon filename |
| Bare form input/select/textarea | `native-controls` | labels, validation, live vs committed state; retain native geometry |
| Styled full-width field | `input` | h-9/padded style is not parity with bare Settings inputs |
| Label + hint + error | `field` | apply supplied id/describedby/invalid to actual control |
| Numeric draft | `number-field` | parser/formatter, units, constraintError, commit transaction |
| Slider gesture | `range-field` | preview/commit/cancel rollback and undo grouping |
| Native boolean choice | `checkbox` or `switch` | controlled checked/onChange; mixed is not a third saved value |
| One choice | `radio-group` | stable option values, label and controlled onValueChange |
| Status | `notice` | localized safe text, tone and optional live urgency |
| Group/collapse | `panel` | stable IDs, controlled open state and storage adapter |
| Overlay | `dialog`, `menu`, `popover`, `tooltip` | title, focus target, trigger composition, actual interaction state |
| Tab group | `tabs` | stable values and content IDs, existing store adapter |

```tsx
import {Field} from './ui/field';
import {NativeSelect} from './ui/native-controls';

<Field label={t('redesign.units')} hint={t('units.hint')} controlId="units">
  {control => <NativeSelect {...control} value={units}
    onChange={event => commitUnits(event.currentTarget.value)}>
    <option value="auto">{t('units.auto')}</option>
    <option value="metric">{t('units.metric')}</option>
  </NativeSelect>}
</Field>
```

The translation keys and domain commit handler above illustrate caller-owned inputs; do not copy nonexistent
keys into production. All user-facing strings go through existing i18n, including errors and mixed labels.
Do not render provider error objects or arbitrary imported strings as instructions or HTML.

NumberField commits once on Enter/blur, restores on Escape, accepts bounded arrow steps, and uses
`resetKey` when selection identity changes while displayed values stay equal. It rejects null/mixed as an implicit zero.
RangeField begins one gesture, previews values and commits on completion; Escape/pointer cancellation/lost capture/
unmount/disabled state cancels. It does not own engine writes. RadioGroup uses native radio semantics.
Notice is silent by default; choose polite/status for an update or assertive/alert only when interruption is needed.
Tooltip does not replace an accessible name. Disabled Base UI menu items can be focused, but must never activate.

## Compose without changing a contract

Keep `data-testid`, aria-label, id, ref, pointer-capture, commit timing and DOM-sensitive hooks unless reviewed.
`data-slot` is additive. Preserve localized semantics and document/selection identity. Use `cn` for classes,
semantic tokens for paint, and current geometry for migration. A wrapper is not permission to redesign.
Base UI portal focus/Escape/collision behavior stays with the primitive; do not recreate it in shell state.
StudioTooltip namespace exists for old coupled JSX; new code should normally use the flat tooltip surface.

Before migrating a consumer, capture its current CSS and behavior, compare with the wrapper, then inspect pixels
in light/dark/high contrast, disabled/invalid/mixed, keyboard focus, reduced motion and relevant density/zoom.
Keep existing tests and thresholds intact. `check:ds` protects the hook inventory and ratchets direct Base UI imports;
exceptions are a reviewed boundary, not a shortcut. See [Settings plan](settings-migration-plan.md).

## Tokens and imported themes

Use [token tables](contributor-tokens.md) for the active paint/geometry contract and
[importer guide](theme-importer-guide.md) for bounded color exchange. Native material, document paint,
canvas backgrounds and syntax palettes are separate owners, not theme-import targets.

See [gallery index and studio recipes](gallery-index.md) for StudioProgress, starter/status/recents, panels and importer usage.
