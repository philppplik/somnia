# Migration guide: bespoke controls to DS primitives

How to replace a raw `<button>`, `<input>`, `<select>` or `<textarea>` in studio
code with the matching design-system primitive, without changing behavior.
`npm run check:ds` enforces this: every production file has a recorded raw-control
allowance in `phase1/scripts/ds-control-debt.json`, and any occurrence beyond it
fails with a lint-style `file:line` diagnostic. Allowances only shrink. A migrated
file stays listed at zero, so reintroducing a raw control fails the check.

Before editing, read the [contributor guide](contributor-guide.md) decision table
to pick the smallest wrapper. The rules below apply to every migration:

- Keep `data-testid`, `aria-label`, `id`, `ref`, keyboard, focus, commit timing and
  pointer behavior exactly as they are. A wrapper is not permission to redesign.
- Keep every test and threshold intact. Add coverage; never weaken assertions or
  refresh goldens to hide a migration diff.
- Use `cn` for classes and semantic tokens for paint. Do not copy hardcoded hex,
  pixel text sizes or inline style objects into the new code.
- Inspect pixels in light and dark (plus high contrast, disabled/invalid/mixed and
  keyboard focus where the control has those states) before calling it done.

## Action buttons

Before:

```tsx
<button type="button" className="close-btn" onClick={closeTab} aria-label={t('tabs.close')}>
  <CloseIcon />
</button>
```

After, when native geometry must survive (tab close buttons, window controls,
tight row actions measured against the OS chrome):

```tsx
import {NativeButton} from './ui/native-controls';

<NativeButton type="button" className="close-btn" onClick={closeTab} aria-label={t('tabs.close')}>
  <CloseIcon />
</NativeButton>
```

`NativeButton` is a geometry-free pass-through: the existing class and layout keep
working, the element gains a `data-slot` hook, and the ratchet counts it as migrated.

After, when the action is ordinary chrome (dialog footer, toolbar, panel header):

```tsx
import {Button} from './ui/button';

<Button type="button" variant="outline" size="compact" onClick={closeTab}>{t('tabs.close')}</Button>
```

Icon-only actions use `IconButton`, which requires a translated `aria-label`:

```tsx
import {IconButton} from './ui/icon-button';

<IconButton aria-label={t('tabs.close')} onClick={closeTab}><CloseIcon /></IconButton>
```

Pick `variant` (`ghost` default, `outline`, `primary`) and `size`
(`normal`, `icon`, `compact`, `tiny`, `row`) to match the current rendered
geometry; do not restyle the surrounding layout in the same change.

## Text inputs

Before:

```tsx
<input value={query} onChange={event => setQuery(event.currentTarget.value)}
  placeholder={t('palette.search')} aria-label={t('palette.search')} />
```

After, when the input must keep its bare native geometry (command palette search,
compact inline editors, Settings-style rows):

```tsx
import {NativeInput} from './ui/native-controls';

<NativeInput value={query} onChange={event => setQuery(event.currentTarget.value)}
  placeholder={t('palette.search')} aria-label={t('palette.search')} />
```

After, when the design calls for the styled full-width field:

```tsx
import {Input} from './ui/input';

<Input value={query} onChange={event => setQuery(event.currentTarget.value)}
  placeholder={t('palette.search')} aria-label={t('palette.search')} />
```

The styled `Input` is h-9 with DS padding and focus paint. It is not visual parity
with a bare input; verify the surrounding layout actually expects the styled field.

## Selects and textareas

Before:

```tsx
<select value={units} onChange={event => commitUnits(event.currentTarget.value)}>
  <option value="metric">{t('units.metric')}</option>
</select>
<textarea value={notes} onChange={event => setNotes(event.currentTarget.value)} rows={3} />
```

After:

```tsx
import {NativeSelect, Textarea} from './ui/native-controls';

<NativeSelect value={units} onChange={event => commitUnits(event.currentTarget.value)}>
  <option value="metric">{t('units.metric')}</option>
</NativeSelect>
<Textarea value={notes} onChange={event => setNotes(event.currentTarget.value)} rows={3} />
```

Options, optgroups and event shapes stay native; only the element owner changes.

## Labels, hints and errors

Before:

```tsx
<label htmlFor="units">{t('redesign.units')}</label>
<NativeSelect id="units" aria-describedby="units-hint" ...>...</NativeSelect>
<p id="units-hint">{t('units.hint')}</p>
```

After, letting `Field` own the id and aria wiring:

```tsx
import {Field} from './ui/field';

<Field label={t('redesign.units')} hint={t('units.hint')} controlId="units">
  {control => <NativeSelect {...control} value={units} onChange={...}>...</NativeSelect>}
</Field>
```

Spread the supplied `control` props (`id`, `aria-describedby`, `aria-invalid`)
onto the actual control element. Validation, parsing and commit logic stay with
the caller.

## Numbers, sliders and booleans

Replace ad-hoc numeric inputs with `NumberField` (draft editing, Enter/blur commit,
Escape restore, bounded arrow steps, `resetKey` on identity change):

```tsx
import {NumberField} from './ui/number-field';

<NumberField label={t('stroke.width')} unit="px" value={width} min={0} max={64}
  onCommit={commitWidth} />
```

Replace `input type="range"` gestures with `RangeField` (preview during the drag,
single commit on release, Escape/capture-loss cancellation):

```tsx
import {RangeField} from './ui/range-field';

<RangeField label={t('opacity')} value={opacity} min={0} max={100}
  onPreview={previewOpacity} onCommit={commitOpacity} onCancel={revertOpacity} />
```

Replace `input type="checkbox"`, toggle switches and radio sets:

```tsx
import {Checkbox} from './ui/checkbox';
import {Switch} from './ui/switch';
import {RadioGroup} from './ui/radio-group';

<Checkbox label={t('snap.enabled')} checked={snap} onChange={...} />
<Switch label={t('autosave')} checked={autosave} onChange={...} />
<RadioGroup label={t('align.distribute')} name="distribute" value={mode}
  options={[{value:'h',label:t('align.horizontal')},{value:'v',label:t('align.vertical')}]}
  onValueChange={commitMode} />
```

All three keep native form semantics and controlled state; `mixed`/indeterminate
is a display state, never a third saved value.

## Status and sections

Before:

```tsx
<p className="status-line">{t('export.done')}</p>
```

After:

```tsx
import {Notice} from './ui/notice';

<Notice tone="success" live="polite">{t('export.done')}</Notice>
```

Notice is silent by default; use `live="polite"` for updates and `live="assertive"`
only when interruption is required. Replace hand-rolled collapsible sections with
`PanelSection`, and header/body chrome with `PanelHeader`/`PanelBody`:

```tsx
import {PanelSection} from './ui/panel';

<PanelSection id="stroke" title={t('stroke')} open={open} onOpenChange={setOpen}>...</PanelSection>
```

## Tabs, menus and overlays

Tab groups, menus, tooltips, popovers and dialogs already have wrappers in
`tabs.tsx`, `menu.tsx`, `tooltip.tsx`, `popover.tsx` and `dialog.tsx` over the
Base UI primitives. Migrate by swapping the import and keeping the composition:

- Base UI portal, focus, Escape and collision behavior stays with the primitive;
  do not recreate it in local state.
- Disabled menu items stay arrow-focusable but must never activate.
- Tabs use manual activation; keep stable `value` and content IDs so store
  adapters and tests keep working.
- Compound bespoke tab strips with nonstandard behavior (middle-click close,
  fixed-position context menus, drag reorder) are not forced through shared Tabs;
  migrate their inner controls (`NativeButton`, `NativeInput`) and record the
  host in the audit instead of redesigning it.

## Verification per migration

1. `npm run check:ds` passes with the file's allowance unchanged or lower.
2. Existing unit and browser tests pass unmodified.
3. New focused tests cover the migrated control's states.
4. Light/dark screenshots inspected at real size before the patch leaves the branch.
5. `node scripts/check-ds.mjs --update` only after review; it accepts reductions
   only and can never raise an allowance.
