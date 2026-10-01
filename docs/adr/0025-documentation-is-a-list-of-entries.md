# Documentation is a list of entries

Each language's **Documentation** becomes one list of **Documentation entries**, each with an id, a
kind, its names, its searchable text and a renderer, and the Workbench's Documentation panel, the
`/documentation/<language>` pages and the search index all read that list. The prose that today
lives as markup inside Svelte components (the M68K exceptions, the MARS and RARS Screen, the trap
task introductions, the Z80 ports, the addressing modes, the condition codes) moves to markdown
split at its headings, and the widgets that cannot be markdown, such as colour swatches and flag
tables, stay components that an entry names.

We chose this because a search in the panel filters the Documentation and reorders what is left so
the best result is on top, which needs every entry renderable on its own and in any order, and
because a build-time index needs the text as text. A component that renders a whole page of prose
can be neither reordered nor read without rendering it.

## Considered options

- **Scrape the prerendered HTML.** Index `/documentation/<language>/all` after the build, split at
  heading ids, and leave the components alone. Rejected: the panel could hide what does not match
  but not reorder what does, and a markup change would silently change the index.
- **Make only the existing data separate entries.** Instructions, directives, syscalls, trap tasks
  and registers already are data; each prose component would be one large entry. Rejected: a search
  for "double buffering" would return the whole Screen page.

## Consequences

The panel shows everything the documentation pages show, which it does not today (it has no M68K
trap tasks or exceptions, no MARS or RARS Screen and no RISC-V registers).
