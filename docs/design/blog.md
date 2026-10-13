# ASM Editor blog

The blog, seven launch articles, and five saved audience personas are implemented locally. The custom article-writing skill uses one writer and independent persona reviewers, with audience fine-tuning after the first draft.

## Agreed direction

- The launch content primarily serves assembly students and teachers. Specific, practical security and reverse-engineering use cases can appear alongside it.
- The blog lives on the ASM Editor website and contains tagged standalone posts. The "use case" tag identifies posts explaining concrete tasks people can accomplish with the app.
- Posts include app guides, explanations of how the app is built, and feature walkthroughs. Screenshots and interactive examples support the explanations.
- Reuse the courses' Markdown and Playground rendering, with an article layout inspired by the parent Specy website and without the course sidebar.
- The content serves both search discovery and readers learning how to use the app.
- The homepage leads with curated "Start here" guides and use cases, followed by recent posts, so introductory content stays easy to find as the blog grows.
- The first guided tour is a Blog post with step-by-step annotated screenshots, runnable Playgrounds, and actions to open examples in the editor. An in-app overlay that highlights controls and tracks progress is outside the initial scope.
- Blog posts teach app workflows and link to Courses for assembly theory and to Documentation for reference details.

## Initial post set

These launch topics are covered by the seven articles in `packages/asm-editor/src/blog`.

1. **Getting started with ASM Editor**: a screenshot tour covering create, build, run, debug, and share.
2. **MIPS in your browser: a MARS user's guide**: first examples and coursework, explaining how ASM Editor relates to MARS.
3. **RISC-V in your browser: a RARS user's guide**: first examples and coursework, explaining how ASM Editor relates to RARS.
4. **Understand C/C++ through generated assembly**: compile, inspect, and debug.
5. **Teach assembly with ASM Editor**: shared projects, embeds, test cases, and exams.
6. **Beginner reverse engineering with an x86-64 executable**: a small, verified walkthrough of disassembly and debugging.
7. **How ASM Editor runs assembly in the browser**: an accessible explanation of its internals.

The security walkthrough describes disassembly and debugging. It must demonstrate supported behavior; it does not promise decompilation into higher-level source.

## Tags

Posts have overlapping purpose and subject tags from a small, consistent vocabulary. A post does not have to choose between being a guide and describing a use case.

- Initial purpose tags: `guide`, `use case`, `behind the scenes`.
- Initial subject tags: `MIPS`, `RISC-V`, `x86`, `C/C++`, `teaching`, `reverse engineering`.
- The MARS walkthrough can carry `guide`, `use case`, and `MIPS`, so readers can find it by purpose or architecture.
- Clicking a tag opens a dedicated page such as `/blog/tags/use-case`, with a short introduction and the relevant posts. These pages provide permanent links to collections from articles and app pages.

## Authoring

Posts are managed in the repository as Markdown with metadata and associated screenshot assets, matching the existing course authoring workflow. Publishing happens through the normal site build; a browser-based publishing interface is outside the initial scope.

## Discovery

- Add a "Blog" link to site navigation.
- Use dedicated tag pages and contextual guide links, such as a getting-started link from project creation.
- Defer adding posts to the existing Workbench, Documentation, and Course search. Its current scopes remain in place for the first release.

## SEO and maintenance

- Prerender the blog index, articles, and tag pages with readable text and ordinary links. Runnable Playgrounds enhance the article's static explanation and code.
- Give each page an appropriate title, description, canonical URL, and social preview. Articles include author information and BlogPosting structured data.
- Add published blog routes to the sitemap; keep drafts out of public routes and discovery.
- Keep publication and substantive update dates in editorial metadata. Article dates and sitemap modification dates reflect content changes rather than each site build.
- Capture screenshots from the real app and verify the described workflows and runnable examples before treating a post as ready to publish.
- Keep guides current when the workflows they describe change. Final titles, screenshots, post slugs, and the metadata schema are implementation details to settle against the finished articles.

These follow Google's guidance on [article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), and [sitemap dates](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Deferred from the first release

- An in-app overlay tour with progress tracking.
- Browser-based publishing.
- Blog posts in the existing Workbench, Documentation, and Course search.

## Writing and audience review

- Use a custom article-writing skill built on Wizspec personas directly. The document-writing-orchestrator skill is not part of this workflow.
- One main writer owns article drafts and revisions. Several audience reviewers provide independent feedback, with the cast selected for each article's target reader.
- The writer's initial brief gives only an overview of the topic, broad intended audience, and outcome, alongside factual sources and required content syntax. Detailed personas and their individual checks belong to the reviewers; audience fine-tuning starts with feedback on the completed draft. The writer keeps editorial judgment and preserves usefulness for the broader audience.
- MARS/RARS search arrivals include assembly newcomers, students with some assembly exposure through lectures, and professors discovering the app. Review that content through all three relevant perspectives; prior use of desktop MARS or RARS is not a prerequisite.
- Reviewer feedback is unrestricted free text, without required headings, finding tags, scores, or fixed verdict phrases.
- Blog copy states its subject and instructions directly. Avoid promotional hooks, rhetorical questions, abstract storytelling, repeated benefits, and generic encouragement. Retain the definitions and explanations readers need to complete the task.
- Establish durable personas through persona-interview, including their knowledge boundaries and a dry run, before saving them in `docs/wizspec/personas/`.
- The first assembly newcomer has basic programming knowledge and no prior assembly or ASM Editor experience. Its reviews use only the current article, screenshots and examples, and explicitly linked public material. It starts from that same baseline on every different article; rereads of one revised article use the original reviewer.
- The lecture-exposed student recognizes registers, instructions, and basic memory from class, without mastery. It still needs explicit instructions to build, run, and debug a program.
- The assembly instructor knows assembly and teaching but is new to ASM Editor. It evaluates whether the app fits a concrete course activity, the preparation involved, and how students would reach the result.
- The reverse-engineering walkthrough primarily serves readers with basic C knowledge; x86 assembly familiarity is optional, and prior binary-analysis or ASM Editor experience is not assumed. It also serves readers without C or x86 knowledge, checked through the newcomer perspective with that narrower programming background made explicit for the run.
- The internals article serves a JavaScript/TypeScript web developer who understands ordinary browser UI and application state but has no assumed assembly, emulator, or WebAssembly expertise. It explains how the pieces fit together instead of relying on technology names alone.
- The five confirmed profiles are indexed in [the persona roster](../wizspec/personas/README.md). All start from a fresh baseline for each article, with memory off; substantive revisions return to the same reviewers.
- The installed `asm-blog-writing` skill provides the writer, independent free-text reviews, revision, and reread workflow. Audience feedback checks comprehension; the orchestrator separately verifies app behavior and runnable examples.

## Implementation plan

The milestones below describe the implemented content and site structure. Authoring instructions and the practice executable's rebuild command are in `packages/asm-editor/src/blog/README.md`.

### 1. Content catalog and publication rules

The app currently lives in `packages/asm-editor`. Its courses load `index.md` alongside `meta.json`, and their discovery uses globs beneath `src/content`. Use that same authoring pattern in a separate blog directory:

```text
packages/asm-editor/
  src/blog/<post-slug>/index.md
  src/blog/<post-slug>/meta.json
  src/lib/blog/catalog.server.ts
  src/lib/blog/tags.ts
  static/images/blog/<post-slug>/...
```

Derive the post slug from its folder. Metadata contains a title, plain-text description, registered tag IDs, explicit `draft` or `published` status, publication date for published posts, optional substantive update date, and optional preview image with alternative text. Reuse the existing author identity in `src/lib/seo.ts` for the initial posts. Keep editorial dates authored in metadata.

Maintain one small tag registry with each tag's stable slug, display label, and short public introduction. For example, `use-case` displays as "use case" and `c-cpp` as "C/C++". Keep a curated list of Start Here post slugs separately from date sorting. Render its published entries, then show recent published posts without duplicating those entries in the same homepage listing.

The server catalog validates metadata, dates, tag IDs, content presence, and curated references at build time. All public consumers use its published-post view: listings, article lookup, tag collections, prerender entries, and sitemap generation. A draft cannot become publicly available merely because its slug is known. Invalid published metadata stops the build with the offending content path.

Validate these rules with focused catalog tests, especially exclusion of drafts, direct lookup of a draft, overlapping tags, chronological sorting, and invalid editorial metadata.

### 2. Blog pages and article layout

Add the index at `/blog`, articles at `/blog/posts/[slug]`, and tag collections at `/blog/tags/[tag]`. Generate dynamic prerender entries from the same published catalog; return a proper not-found response for unknown or unpublished articles and unknown tags. Only tags with published posts appear in discovery and prerender entries.

Create a blog layout and small shared post-card and tag-link components under `src/components/blog`. Use the parent website's `src/components/layouts/BlogLayout.svelte` and blog listing as visual references: a prominent title and description, visible dates and author, tag badges, comfortable prose measure, and optional preview imagery. Adapt the layout to ASM Editor's theme variables and navigation. Tag badges are ordinary links; avoid nesting them inside a card-wide link.

Render each article through the existing `MarkdownRenderer.svelte` with heading IDs and embedded Playgrounds. The article header supplies its single page title; Markdown starts at section headings. The renderer already supplies readable prerendered code and upgrades Playground fences to lazy embedded editors in the browser. Use its existing syntax and Open in Editor controls instead of introducing a second example renderer.

Keep article styling within the blog layout. Screenshots need descriptive alternative text, useful captions, and readable annotations; wide images and examples must fit narrow screens. Verify the page with JavaScript disabled and with Playgrounds mounted, including heading links and keyboard navigation.

### 3. Metadata and discovery

Reuse `PageMeta.svelte` for titles, descriptions, and structured data, and add a BlogPosting helper beside the existing helpers in `src/lib/seo.ts`. Blog server loads supply `socialImage` to the root layout, which emits one selected image or the site default alongside its canonical URL. Article metadata includes the public URL, title, description, author, editorial dates, and an absolute image URL when an image exists. Displayed dates and structured data come from the same metadata.

Add published article and tag routes to `src/routes/sitemap.xml/+server.ts` using the catalog. Its current entries use the build date; blog articles must use their editorial update or publication date instead. Use meaningful collection dates where available, or omit `lastmod`, rather than inventing updates on every build.

Add Blog to `DefaultNavbar.svelte`, keeping it accessible on small screens. Add a contextual getting-started link from project creation once its target guide is published. Article links lead to related guides, Courses, and Documentation where they help the task.

Verify generated HTML for titles, descriptions, canonical URLs, image metadata, valid structured data, readable article text and code, and links. Check the sitemap against published routes and confirm drafts do not leak through any listing or generated page.

### 4. Draft, review, and verify the launch articles

Use `asm-blog-writing` with one main writer. Its first brief is an overview of the topic, broad audience, and intended outcome, accompanied by factual evidence and the agreed content syntax. Do not give it the detailed personas or their individual checks. Start with the getting-started tour to establish a useful guide and a real layout example, then cover the remaining agreed topics.

After each complete draft, cast the relevant saved personas independently. The initial review choices are:

| Article                                  | Reviewer perspectives                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Getting started                          | Assembly newcomer and lecture-exposed student                                                                 |
| MIPS/MARS and RISC-V/RARS entry guides   | Assembly newcomer, lecture-exposed student, and assembly instructor                                           |
| C/C++ through generated assembly         | Assembly newcomer and lecture-exposed student; confirm any prerequisite beyond basic programming in the brief |
| Teaching with ASM Editor                 | Assembly instructor and lecture-exposed student for the student-facing steps                                  |
| Beginner x86 reverse engineering         | Reverse-engineering learner and assembly newcomer with no C or x86 assumed                                    |
| How the app runs assembly in the browser | Curious web developer and assembly newcomer for the introductory explanation                                  |

Each reviewer gets its own profile, the draft, and permitted public material. Collect natural free-text feedback. Send the responses verbatim to the writer for refinement, preserving their source and the writer's editorial judgment. Keep the article broadly useful rather than shaping it around every individual preference. Return substantive revisions to the same reviewers; use fresh reviewer contexts for different articles.

The orchestrator checks factual claims against the current implementation and tests the actual workflows, separately from simulated reading. Capture screenshots from the current app, verify each runnable example and its stated result, and inspect each rendered article. In the reverse-engineering walkthrough, supply a reproducible practice executable and show how the observed state supports the conclusion. Simulator compatibility claims and browser execution explanations need current evidence, rather than relying on the older parent-site article or README inventory.

Keep unfinished articles as drafts. Set publication metadata only after their prose, links, assets, examples, and described behavior have been checked.

### 5. Release checks

Run the app's type checks, focused catalog and relevant renderer tests, and a production build. Inspect the resulting prerendered index, article, and tag HTML. Check desktop and narrow layouts in the browser, navigation to and from articles, Playground execution, and Open in Editor actions. Recheck a representative existing course page if shared rendering or metadata code changed.

Record which articles and workflows were actually validated and any remaining gaps. The normal site build includes published posts; external deployment follows the user's existing authorization.

## Local validation — October 13, 2026

All seven launch articles have publication metadata for the site build. One writer
created their first drafts from broad briefs, then revised them using independent
saved persona feedback. The same readers reread substantive revisions. The final
clarifications cover screenshot number formats, Memory navigation, execution
state, embed preparation, and reference navigation. No material reading gaps
remain in the main walkthroughs; persona feedback is a reading assessment,
separate from the executed checks below.

- **Automated checks:** 11 catalog tests, 10 executable/example tests, and 25
  existing Markdown renderer tests pass. App and service-worker type checks,
  targeted lint and formatting, and the production build pass.
- **Generated pages:** the blog index, seven articles, and nine tag collections
  have readable prerendered text, one title heading, canonical URLs, descriptions,
  and one social image. Article structured data matches its metadata, assets and
  static links resolve, and the sitemap contains 17 unique blog URLs with editorial
  dates. Unknown article and tag URLs return 404; catalog tests cover draft
  exclusion. The empty/all-draft catalog also completed a production build.
- **App workflows:** the tour's Build, Run, Step, Undo, and breakpoint steps;
  MIPS and RISC-V input 21 producing 42; live GCC compilation and mapped debugging
  of the C example producing 1, 3, and 6; the teaching solution passing both
  configured cases after reopening its generated embed; Share preserving the
  project and cases; and executable import, Listing navigation, input bytes,
  flags, and both x86 branches were exercised in the browser. C and C++ recorded
  compiler responses are also checked through the simulator offline. Exam feature
  availability was checked against the implementation and its guide link navigates
  to the builder; a complete assessment session was not part of this validation.
- **Rendering:** desktop and 320–390 px layouts were inspected; all seven articles
  fit narrow screens. The tour retains readable code with JavaScript disabled,
  its embedded program runs, and Open in editor creates a working project. A
  representative existing MIPS course still renders with its Playground.

Screenshots are captured from the actual app. The x86 practice ELF and its source
are included, with rebuild instructions. The temporary compiler-capture script
was removed. These are local checks, not CI or deployment evidence; no external
publication was performed.
