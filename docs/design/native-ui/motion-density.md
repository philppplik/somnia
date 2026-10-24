# Shared motion and opt-in density

P12 adds chrome tokens without changing document/export dimensions or Settings layout.

| Token | Default | Reduced motion |
| --- | --- | --- |
| `--motion-fast` | 100ms | 0ms |
| `--motion-standard` | saved `--ui-animation-ms`, otherwise 120ms | 0ms |
| `--motion-ease` | cubic-bezier(.2,0,0,1) | duration is zero |

Shared Button color transitions use fast/ease; Dialog uses standard/ease. The existing saved animation duration still controls Dialog. Both `data-motion=reduce` and OS `prefers-reduced-motion:reduce` stop animation/transition. OS reduction wins even if a saved full-motion choice exists. Close/Escape/focus completion must never depend only on an animation event. Legacy custom motion elsewhere is not certified by these shared cases.

Button (including IconButton), Input, PanelBody/Header/Section accept optional `density="compact" | "normal" | "comfortable"`. Omit it for current geometry. This is **opt-in per primitive**, not a new persisted preference or automatic application-wide scaling. Existing Look density still controls only shell gap. Bare NativeInput/Select/Textarea deliberately keep parity geometry.

| Density | Normal/icon Button and Input height | Button padding | Input padding | Panel padding / gap |
| --- | --- | --- | --- | --- |
| compact | 28px | 8px | 8px | 8px / 4px |
| normal | 36px | 14px | 12px | 12px / 8px |
| comfortable | 44px | 16px | 16px | 16px / 12px |

Explicit Button compact/tiny/row sizes retain their existing dimensions; density only sizes normal/icon controls. Normal matches default geometry. Fixed radii, saved outer radius, fonts, editor metrics and document paint do not change. Consumer class overrides and long labels still need pixel/keyboard review. Compact is not a touch-target certification.

```tsx
<Button density="comfortable" variant="primary">{t('apply')}</Button>
<Input density="compact" aria-label={t('name')} value={name} onChange={editName}/>
<PanelSection density="comfortable" title={t('properties')} id="selection-properties"
  open={open} onOpenChange={setOpen}>{children}</PanelSection>
```

Caller owns unique IDs, localized names, commits and collapse state. Avoid setting density on an entire document or iframe. Custom shared chrome can use `transition-duration:var(--motion-fast)` and `transition-timing-function:var(--motion-ease)`.

Gallery: `/test/design-system/?motion-density`, linked from index. Eight browser cases cover all three geometries in light/dark, explicit compact-size preservation, unchanged radius/collapse keyboard behavior and six OS/saved-motion combinations including full+OS reduce. Render tests verify no density prop leaks to the DOM and unchanged omitted-density classes. Existing parity/focus tests stay unchanged; actual app/native E2E remains CI-only.
