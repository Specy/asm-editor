---
status: accepted
date: 2026-10-26
---

# Tooltips are opt-in attachments that describe and never name

A control that needs explaining gets a **Tooltip** by its component writing `{@attach tooltip(content, options)}` on the element; nothing scans the page for `title` attributes, and an element that takes a Tooltip drops its `title`. The Tooltip is always the element's accessible description, `aria-describedby` pointing at content that stays in the accessibility tree while the card is hidden, and never its name: the name comes from the element's own text or `aria-label`, so an icon-only control carries both. The shared `Button`, `ButtonLink` and `Switch` spread their rest props onto their element, and `Select` onto its trigger button, so an attachment written on them reaches it; their tooltip-like `title` props go as each moves over. See [the Tooltips design](../design/tooltips.md).

## Considered options

- **Upgrading every `title` on its own**, through a global listener or a scan of the DOM: rejected by the owner. Many titles only repeat visible or cut-off text (an Explorer row's path, a long name in the Symbols panel), which is not an explanation, and a scan hides which elements have a Tooltip.
- **A `<Tooltip>` wrapper component**: it either puts an element around the trigger, which moves flex and grid layouts and `:first-child` rules, or takes the trigger through a snippet at every call site.
- **A `use:tooltip` action**: actions do not pass through component props or spreads, so `Button` and the others would each need a prop for it.
- **A `tooltip` prop on each shared component**: each would re-declare and forward the whole API, and a call site would read differently on a component than on a plain element.
- **The Tooltip as the name** (`{ name: true }` setting `aria-label`): it saves an `aria-label` on icon-only controls, but works for text only, not for a snippet, and brings back the double role (name on one element, description on the next) that makes `title` easy to get wrong.
- **`aria-description`** in place of `aria-describedby`: current screen reader support for it could not be confirmed on 2026-10-26; `aria-describedby` works everywhere.
- **`aria-disabled` for a disabled control whose Tooltip says why**: keyboard focus would then show the reason, but every handler would have to check the state itself, and an `aria-disabled` button can still be clicked.

## Consequences

- An icon-only control moving to a Tooltip gains an `aria-label` in the same change.
- A disabled control keeps `disabled` and takes a Tooltip as it is: the pointer shows it (Chrome 153 sends `pointerenter` to a disabled button) and a screen reader reads it, but keyboard-only users cannot bring it up, as with `title`.
- Every element with a Tooltip keeps its content in the DOM while hidden, for its description, so text that only repeats what is shown keeps `title`, rows of long lists included.
