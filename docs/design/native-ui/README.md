# Somnia native UI design system

Somnia is one local-first creative workspace. Its chrome stays familiar while the active document, selection and available services determine what can be edited. This guide documents the implemented tokens, components, interaction rules and context boundaries, then separates them from the shared Studio frame under construction.

## Read by role

| Reader | Start with | Continue with |
| --- | --- | --- |
| Designer | [Foundations and tokens](tokens.md) | [Components](components.md), [Interaction and UX](ux.md) |
| Frontend developer | [Components](components.md) | [Context and awareness](context-awareness.md), [Contribution and verification](verification.md) |
| Engine or extension developer | [Context and awareness](context-awareness.md) | [Studio direction](studio-direction.md), [Extension documentation](../../extensions/README.md) |
| Reviewer | [Contribution and verification](verification.md) | Token reference and the relevant behavior section |

## Scope and evidence

**Implementation baseline:** `somnia-agent` commit `d91046fdb82ed861b18e11bda1b38d73cd25c99e`, inspected on 2026-10-09. This is a source snapshot, not a claim that every branch, release or operating system has the same behavior. The documentation change does not alter runtime code.

The baseline includes the Base UI/shadcn-derived primitives, Components browsing system, raster/vector/PDF inline editors and existing context-sensitive controls. The baseline snapshot predates Studio S0/S1; they have since been integrated (see [Studio direction](studio-direction.md)). Statements in this guide about the baseline were not re-audited against the Studio shell.

Throughout the guide:

- **Implemented** means the cited source contains the behavior. It does not imply a native Windows/macOS acceptance test passed.
- **Design requirement** means a rule for new work or review. A requirement can be stricter than current implementation.
- **Planned** means the repository design describes the direction, but this baseline does not contain the complete implementation.
- **Gap** means the source and desired contract differ, or a property cannot be established from this snapshot.

All file links are repository-relative, so they remain useful on a feature branch and after integration. The commit above defines the audit boundary. Recheck the linked source when changing a contract.

## Page index

1. [Foundations and tokens](tokens.md)
2. [Component contracts](components.md)
3. [Interaction and UX](ux.md)
4. [Context and awareness](context-awareness.md)
5. [Shared Studio direction](studio-direction.md)
6. [Contribution and verification](verification.md)
7. [Foundation palette values](palette-reference.md) and [machine-readable reference](token-reference.json)

## The system in one view

```text
Theme choice + appearance preferences + platform facts
        |
        v
CSS semantic tokens -> Tailwind theme bridge -> UI primitives
        |                                      |
        +--------------------+-----------------+
                             v
              Stable application shell
       titlebar / commands / rails / tabs / status
                             |
       active source or media + selection + service state
                             |
                             v
      document editor / side-panel content / available actions
                             |
                  transactions and history
                             |
                  save / export / dirty guards
```

Context adaptation is not permission. A selected object can suggest a control; it cannot make an unsafe save, unsupported conversion or unavailable service valid.

## Principles

1. Keep spatial anchors stable. Change the contents and enabled state of a slot, not the position of unrelated commands.
2. Use one control for one job. Rails choose panels; document tabs choose documents; view controls choose representations. Do not add a second panel tab strip for the same rail choices.
3. Keep app preferences out of document content. UI zoom, theme and typography belong to the shell, not exported HTML or an iframe's stylesheet.
4. Make local state honest. A dirty marker is not a successful write. Save completion must correspond to the exact snapshot written.
5. Show actionable context, not implementation noise. Detailed failures belong in Problems/logging; the status region can give a short human-readable notice.
6. Preserve escape routes. Keyboard, undo, close cancellation, export copies and opaque fallbacks are part of the design system.
7. Use semantic tokens first. Exact values below describe the current source, not an excuse to duplicate literals in new components.
8. Do not advertise engine fidelity beyond what the specific format path proves.

## Source map

| Area | Source of truth |
| --- | --- |
| Foundation values | [`tokens.css`](../../../phase1/src/styles/tokens.css) |
| Tailwind aliases, general control styling | [`global.css`](../../../phase1/src/styles/global.css) |
| Bento cards, glass scopes, scrollbar treatment | [`bento.css`](../../../phase1/src/styles/bento.css) |
| CSS loading order | [`main.tsx`](../../../phase1/src/main.tsx) |
| Theme choices | [`theme.ts`](../../../phase1/src/lib/theme.ts) |
| Look values, sanitization, persistence | [`look.ts`](../../../phase1/src/lib/look.ts) |
| UI preferences and panel widths | [`uiPrefs.ts`](../../../phase1/src/lib/uiPrefs.ts) |
| Native compositor gate | [`windowBackground.ts`](../../../phase1/src/lib/windowBackground.ts) |
| Shared shell and slot routing | [`App.tsx`](../../../phase1/src/App.tsx) |
| Command availability and shortcut dispatch | [`commands.ts`](../../../phase1/src/lib/commands.ts) |
| Document/rendering routing | [`Canvas.tsx`](../../../phase1/src/components/Canvas.tsx) |
| Application state | [`appStore.ts`](../../../phase1/src/store/appStore.ts) |
| Shared Studio design | [`pdf-layout-tools.md`, section 2a](../pdf-layout-tools.md#2a-one-editor-format-based-modes-owner-steering) |

## Related guides

Do not create competing homes for format-specific behavior. Use [vector tools](../vector-tools.md), [PDF/layout design](../pdf-layout-tools.md), [appearance surfaces](../appearance-surfaces.md), [glass behavior](../../GLASS.md), [window background](../../WINDOW-BACKGROUND.md), [Components](../../features/component-system.md), [collaboration](../../collaboration.md), [Agent](../../agent/README.md) and [settings deep links](../../SETTINGS-DEEP-LINKS.md) for their own details.

This guide supplies the cross-cutting system. The [verification guide](verification.md) lists known gaps and the procedure for keeping it current.
