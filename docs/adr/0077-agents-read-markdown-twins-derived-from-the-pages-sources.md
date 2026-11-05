---
status: accepted
date: 2026-11-05
---

# Agents read Markdown twins derived from the pages' sources

The site is made readable to language-model agents that can only fetch URLs, through `/llms.txt` and a **Markdown twin** of each page: the page's URL with `.md` appended, as the llms.txt proposal suggests, so an agent holding any link to the site can read it without first reading an index. A **Documentation entry** without a page of its own has its twin one level below its Chapter page, at the Chapter page's URL followed by the entry's anchor (`/documentation/mips/syscall/service-1.md`), because the entry is the unit [ADR 0025](./0025-documentation-is-a-list-of-entries.md) makes the Documentation of, and a Chapter page holds many.

Every twin is rendered at build time from the sources its page renders: the Chapters and entries of ADR 0025 through a markdown renderer for each kind of entry view, and the Lectures' and Blog posts' own `index.md` and `meta.json`. Only the files that exist for agents alone, such as `/llms.txt` itself, are written for them, and those too list what the sources hold rather than a hand-kept copy.

A twin may change how its source is written down but never its words. Every twin goes through one rewrite of the markdown tree in the site's own pipeline ([ADR 0053](./0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)): a code fence keeps its language and its meaningful flags become a line before it (an Exercise's starting code, a solution, a Testcase for the Exercise above), the flags that only set up a Playground are dropped, every link and image becomes an absolute URL, and a link to a page or entry that has a twin points at the twin. Solutions stay, in their `<details>`, as public as they are on the page.

Twins exist for the Documentation (each language, Chapter page, entry and instruction page), the Courses (the list, each Course and each Lecture), the Blog (the list, each post and each tag), the Examples page and the changelog. The home page, the app surfaces (Projects, the embed, Exams, chat, the MARS and RARS apps, donations, search) and each language's `/all` page have none: `/llms.txt` stands in for the home page, and `/all` repeats every Chapter at once. The Examples page's twin lists its programs and links their archives without unpacking their source, which its page does not show either; the Examples that close each Language course are Lectures, readable through their twins.

A twin that lists lists one level, so none outgrows what a fetch tool reads whole: `/llms.txt` the languages, Courses, Blog, Examples and changelog; a language its Chapters; a Chapter its entries, at most some 40 KB for x86's Instructions where every x86 entry at once would be some 130 KB. A Course lists its Modules with their Lectures. Each line is a link to a twin and the one-line description its source already has: an entry's summary (an instruction's with its signature and category), a Chapter's description, a Course's or Lecture's `meta.json`. Each language hub's introduction moves out of its Svelte page into markdown beside `DOCUMENTATION_SITES`, which the page and its twin both render.

An agent that knows what it wants builds the URL: `/llms.txt` states each kind of entry's URL rule, derived from the entries' own hrefs (`/documentation/<language>/instruction/<mnemonic>.md`, `/documentation/<language>/syscall/service-<n>.md`). An agent with a shell searches: each search shard has an `llms-full.txt` of its twins joined in order, `/documentation/<language>/llms-full.txt` and `/learn/courses/<course>/llms-full.txt`, listed under `/llms.txt`'s Optional heading. There is no `/llms-full.txt` of the whole site, which no fetch tool would read whole and the shards' files already hold in pieces.

Every page that has a twin names it in its head as `<link rel="alternate" type="text/markdown">`, from the same map of routes to twins the build writes the twins from. Twins are served as `text/markdown; charset=utf-8` with `X-Robots-Tag: noindex`, so a search engine lists the page rather than its twin while an agent can still fetch it; the `llms` files are served as `text/plain`. The sitemap lists pages only, and `robots.txt` names `/llms.txt` in a comment. `/documentation` ends with a "Documentation for agents" section whose Copy button copies a message for an AI assistant that points it at `/llms.txt` and the twins' URL rules (`AGENT_MESSAGE`, its URLs built by the same rules). A button that copies a page as markdown or opens it in a chat assistant is left for later.

Twins are prerendered SvelteKit endpoints beside the pages' routes, as `/search/[shard].json` and `/sitemap.xml` are, each calling the loader its page's `load` calls. One module holds the map of routes to twins, a markdown renderer for each kind of entry view and the rewrite. An instruction's twin lists the Lectures that teach it, as its page does; an alias's twin says which instruction it is another spelling of and links that one's twin. Tests over the build check that every page with a twin has the file and the head link, and that every link in a twin or an `llms` file is absolute and reaches a built twin or page (`scripts/twins-check.mjs`, run by the build). No size limit is enforced.

## Consequences

- An instruction's twin route sits in each language's own folder, `documentation/<language>/instruction/[instructionName].md`, beside the page route whose `load` it calls. The shared `documentation/[language]/[page]/[anchor].md` cannot serve it: SvelteKit ranks the language's static folder above the `[language]` parameter, so the instruction page route would take `addi.md` as a mnemonic.
- Moving the language hubs' introductions into markdown sets them with `InlineMarkdown`, whose links open in the same tab where x86's links to NASM and blink opened a new one.

## Considered options

- **A separate `/llms/` tree laid out by content type.** Cleaner to read as an API, but a second URL space beside the pages people link to, and an agent holding a page's link could not reach its content without reading the tree first.
- **Hand-written markdown for agents.** Rejected: two copies of every page would drift, and no one would notice the stale one.
