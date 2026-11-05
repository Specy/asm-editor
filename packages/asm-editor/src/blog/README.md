# Blog authoring

Each post has a stable folder slug, `index.md`, and `meta.json`. The blog uses the
courses' Markdown renderer and Playground syntax, without their sidebar. Start
Markdown at `##`; the article page renders the title from metadata.

Write directly. Start with what the article covers, what the reader will do, and
any prerequisites. Use concrete headings and instructions. Remove promotional
hooks, rhetorical questions, repeated benefits, and generic encouragement. Keep
definitions and explanations that readers need to follow the steps.

```json
{
    "title": "Run and debug a MIPS program",
    "description": "Build a MIPS program, read terminal input, and inspect registers at a breakpoint.",
    "tags": ["guide", "use-case", "mips"],
    "status": "draft"
}
```

Choose tags from `src/lib/blog/tags.ts`. A new tag needs a stable ID, display label,
and collection introduction there. Start Here is curated in
`src/lib/blog/catalog.server.ts`; other posts are sorted by publication date.

Keep unfinished posts as drafts. The dev server shows drafts like published posts,
with a Draft badge, so you can read one as it will look; a draft without
`datePublished` is dated today there. A build excludes drafts from article lookup,
listings, prerender entries, tag collections, and the sitemap, and validates
metadata, registered tags, dates, and published content.

When a post is ready, set `status` to `published` and add `datePublished` in
`YYYY-MM-DD` form. Add `dateUpdated` for substantive changes; retain the original
publication date. Dates are editorial values, not generated on each build.

Screenshots belong in `static/images/blog/<slug>/`. Capture the actual app, give
Markdown images descriptive alternative text, and explain the important state in
nearby prose. Optional card and social-preview metadata takes this form:

```json
"image": {
    "src": "/images/blog/my-guide/workbench.webp",
    "alt": "The app state shown in this screenshot"
}
```

Use the `asm-blog-writing` skill for substantive new posts and revisions. One
writer drafts from a broad topic, audience, and outcome brief. The saved personas
in `docs/wizspec/personas/` independently review completed drafts with free-text
feedback; the writer then revises and the same readers reread substantive changes.
Keep the review process and internal evidence out of published articles.

Verify the described workflow in the app separately from audience review. For
interactive examples, use the existing course fences, for example
`mips|playground|console|allow-open`. Runnable article examples are checked in
`src/lib/blog/examples.test.ts`; add meaningful expected results when changing or
adding an example. The C/C++ fixtures record real Compiler Explorer responses so
the simulator checks can run offline; recapture them if those source examples
change.

Before release, run focused blog tests, app type checks, and the production build.
Inspect prerendered text and metadata, local links, screenshots, desktop and narrow
layouts, and the article's Playground and Open in editor actions.

## Reverse-engineering practice executable

The Linux x86-64 ELF in the cover screenshot is built from
`static/downloads/blog/first-branch.s`, written in GNU Intel assembly syntax. The
article no longer links to it. Its download URLs remain because links to them have
already been shared. From this package directory, rebuild it using:

```sh
gcc -nostdlib -static -no-pie -Wl,--build-id=none,-e,main \
    static/downloads/blog/first-branch.s \
    -o static/downloads/blog/first-branch
```

The program checks its first input byte. Uppercase `A` prints `Accepted`; `B`
prints `Try again`. After rebuilding, verify both paths in the simulator. Then
check the addresses, Listing text and flags in the cover screenshot against the new
artifact.

## Decompilation flag executable

The flag example uses a dynamically linked Linux x86-64 executable built from
`static/downloads/blog/find-the-flag.c`. From this package directory, rebuild it
using:

```sh
gcc -O0 -fno-stack-protector -fcf-protection=none -fno-pie -no-pie \
    -Wl,--build-id=none static/downloads/blog/find-the-flag.c \
    -o static/downloads/blog/find-the-flag
```

The matching input, `flag{read_the_pseudocode}`, prints `Flag accepted`, while a
different input prints `Wrong flag`. After rebuilding, check both paths in the
simulator and verify the article's Pseudocode and screenshot against the new
executable.

The article's **Try ASM Editor** link opens this executable as a Project with one
testcase for each path. After rebuilding, make a new link from a Project that holds
the new executable and those testcases (`createSharePayload` in `src/lib/utils.ts`).
`examples.test.ts` checks that the link's executable is the same as the download and
that its testcases pass.
