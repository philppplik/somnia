# Interface P24 delta

- Variant lifecycle management on component masters (undo per action):
  - `renameVariant(doc, componentId, variantId, name)`: renames a variant in place; instance pins keep working because they reference the stable variant id, not the name. Rejects empty/invalid names, duplicates within the component, unknown ids and locked masters.
  - `removeVariant(doc, componentId, variantId)`: removes a variant master subtree. Blocked for the last remaining variant, locked masters and variants pinned by any instance, so instances are never stranded. Axis values no longer used by any remaining variant are retired; an axis whose values all disappear is dropped together with its property, and empty `props` maps are cleaned up. Serialisation roundtrip covered.
  - Master inspector gains a Variants section: rename field per variant plus a remove button (disabled below two variants) with a note that removal is blocked while an instance uses the variant.
- Per-property override reset on instances: text and swap editors gain a ghost "Reset property" button whenever that property carries an instance override; one click clears exactly that value (one undo), and the override map is dropped when it becomes empty.
- Five locales via a P24 catalogue; DS Button/Field only, no raw controls; no new dependencies.
