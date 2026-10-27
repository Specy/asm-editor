<script lang="ts">
    /**
     * Markdown as the app shows it: rendered once by [the pipeline](../../../lib/content/markdown.ts),
     * the same way in the server render and in the browser, so the prerendered page is what its
     * reader keeps. Once mounted, each **Playground** swaps its embed in for the code block the
     * render left, and a host that asks colours the remaining code blocks with Monaco
     * ([ADR 0053](../../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
     */
    import { renderMarkdown, type MarkdownOptions } from '#lib/content/markdown.ts'
    import { playgroundEmbedUrl } from '#lib/content/markdownPlaygrounds.ts'
    import { isEmbedBuiltMessage } from '#lib/content/embedMessages.ts'
    import { colourCodeBlocksWithMonaco } from '#lib/content/monacoCodeBlocks.ts'
    import { codeBlockStyle } from '#lib/content/codeBlockStyle.ts'
    import { generateTheme } from '#lib/monaco/editorTheme.ts'
    import './codeBlocks.css'

    interface Props {
        source: string
        linksInNewTab?: boolean
        style?: string
        spacing?: string
        simpleCode?: boolean
        /** Show line numbers beside fenced code; configurable by callers, with no UI control. */
        lineNumbers?: boolean
        /** Reserve editor gutter spacing; ordinary listings use a compact gutter by default. */
        gutterSpacing?: boolean
        disableLinks?: boolean
        /**
         * Whether the content sits in a column centred in its container, the way a lecture or an
         * article reads. False left-aligns every block instead, for prose that has to line up with
         * whatever surrounds it - a documentation page's description beside its operands, say. The
         * measure is unchanged either way; only the free space moves.
         */
        centered?: boolean
        /**
         * Give the h2 and h3 headings their slugs as ids, as a Lecture does, so a link can open the
         * page at one of them.
         */
        headingIds?: boolean
        /**
         * How playground fences render: as embedded editors (`embed`), or as plain highlighted code
         * (`code`), which is how a Lecture section reads inside the Documentation panel.
         */
        playgrounds?: 'embed' | 'code'
        /**
         * Markdown a Project File holds, which whoever shared the Project wrote: playgrounds as
         * plain code, links out in a new tab, and none of its own styles, frames or forms.
         */
        untrusted?: boolean
        /**
         * Colour the code blocks in languages our own highlighters do not know (Python, JSON…)
         * with Monaco, loading it if it is not yet: for the hosts Monaco belongs to anyway, the
         * Workbench's Markdown Preview and the Exam's pages.
         */
        monacoColors?: boolean
        /**
         * Called with each render's content, still inert, before it is shown: where a host points
         * images and links at things of its own. A new function renders again. Browser only.
         */
        prepare?: (content: DocumentFragment) => void
    }

    let {
        source,
        linksInNewTab,
        style,
        spacing,
        simpleCode,
        lineNumbers = !simpleCode,
        gutterSpacing = false,
        disableLinks,
        centered = true,
        headingIds = false,
        playgrounds = 'embed',
        untrusted = false,
        monacoColors = false,
        prepare
    }: Props = $props()

    /** The code blocks' colours and font, the editor's. */
    const codeStyle = $derived(codeBlockStyle())

    const options = $derived<MarkdownOptions>({
        //a Lecture section read in the Documentation panel opens its links beside the Workbench
        links: disableLinks
            ? 'disabled'
            : linksInNewTab || playgrounds === 'code'
              ? 'new-tab'
              : undefined,
        headingIds,
        playgrounds,
        untrusted
    })

    /** A render's HTML as the host prepared it, parsed where nothing in it loads or runs. */
    function prepared(html: string, finish: typeof prepare): string {
        if (!finish || typeof document === 'undefined') return html
        const template = document.createElement('template')
        template.innerHTML = html
        finish(template.content)
        return template.innerHTML
    }

    const html = $derived(prepared(renderMarkdown(source, options), prepare))

    let content: HTMLDivElement | undefined = $state()

    /**
     * Each marked playground's embed, in place of the code block the render left: the same box,
     * so nothing around it moves. Built here rather than in the render, so a page that runs no
     * scripts, and a crawler, read the worked example as code.
     */
    $effect(() => {
        void html
        if (!content) return
        for (const marked of content.querySelectorAll<HTMLElement>('[data-playground]')) {
            const src = playgroundEmbedUrl({
                info: marked.dataset.playground ?? '',
                code:
                    marked.tagName === 'PRE'
                        ? (marked.querySelector(':scope > code')?.textContent?.trimEnd() ?? '')
                        : '',
                testcases: marked.dataset.testcases,
                program: marked.dataset.program
            })
            if (!src) continue
            const iframe = document.createElement('iframe')
            iframe.className = marked.className
            const box = marked.getAttribute('style')
            if (box !== null) iframe.setAttribute('style', box)
            if (marked.dataset.builtHeight) iframe.dataset.builtHeight = marked.dataset.builtHeight
            //each embed boots a whole editor, so a lecture with five of them would boot five
            //before the reader has scrolled to the second
            iframe.setAttribute('loading', 'lazy')
            iframe.src = src
            marked.replaceWith(iframe)
        }
    })

    /**
     * A playground whose panels wait for a Build starts as short as its code, and its frame takes
     * the height its fence asked for (`data-built-height`) while its embed says the program is
     * built ([embedMessages.ts](../../../lib/content/embedMessages.ts)).
     */
    $effect(() => {
        if (!content) return
        const frames = content
        const resize = (event: MessageEvent) => {
            if (!isEmbedBuiltMessage(event.data)) return
            for (const iframe of frames.querySelectorAll<HTMLIFrameElement>(
                'iframe[data-built-height]'
            )) {
                if (iframe.contentWindow !== event.source) continue
                iframe.style.height = event.data.built ? (iframe.dataset.builtHeight ?? '') : ''
            }
        }
        window.addEventListener('message', resize)
        return () => window.removeEventListener('message', resize)
    })

    $effect(() => {
        void html
        if (!monacoColors || !content) return
        //read here, so the blocks are coloured again when the theme changes
        const theme = generateTheme()
        let current = true
        colourCodeBlocksWithMonaco(content, theme, () => current).catch((error) =>
            console.error('Monaco could not colour a code block', error)
        )
        return () => {
            current = false
        }
    })
</script>

<div
    class="_markdown"
    class:heading-ids={headingIds}
    class:simple-code={simpleCode}
    class:code-gutter-spacing={gutterSpacing}
    style={style ? `${codeStyle}; ${style}` : codeStyle}
    style:--gap={spacing}
    style:--md-inline-margin={centered ? null : '0'}
    style:--code-block-gutter-display={lineNumbers ? 'block' : 'none'}
>
    <div class="markdown-body" bind:this={content}>
        <!-- sanitized by the pipeline: DOMPurify, or its stricter rules for a Project File's -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html html}
    </div>
</div>

<style lang="scss">
    ._markdown {
        display: flex;
        flex-direction: column;
        line-height: 1.4;
        letter-spacing: 0.01em;
    }

    /* a heading opened by its id lands below the fixed navbar rather than under it */
    .heading-ids :global(h2[id]),
    .heading-ids :global(h3[id]) {
        scroll-margin-top: 4.5rem;
    }

    :global(._markdown pre.code-block:not(.code-playground)) {
        margin: 1rem 0;
    }

    :global(._markdown .markdown-body) {
        display: flex;
        flex-direction: column;
        gap: var(--gap, 1rem);
    }

    :global(._markdown p) {
        color: var(--background-text-muted);
    }

    :global(._markdown table) {
        border-collapse: collapse;
        overflow-x: auto;
        display: block;
        margin: 0.5rem var(--md-inline-margin, auto);
        font-family: 'Fira Code', monospace;
        border-radius: 0.5rem;
        border: solid 0.1rem var(--tertiary);
        width: fit-content;
        max-width: 100%;
    }

    :global(._markdown code:not(pre code)) {
        font-family: 'Fira Code', monospace;
        background: var(--secondary);
        padding: 0.2rem 0.4rem;
        border-radius: 0.3rem;
        color: var(--accent);
    }

    :global(._markdown hr) {
        border: none;
        height: 2px;
        background-color: var(--secondary);
        min-width: min(100%, 65ch);
        margin: 1rem var(--md-inline-margin, auto);
    }

    :global(._markdown table:last-child) {
        margin-bottom: 0;
    }

    :global(._markdown thead) {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }

    :global(._markdown thead th) {
        padding: 0.4rem;
        border-right: 0.1rem solid var(--secondary);
    }

    :global(._markdown thead th:first-child) {
        border-top-left-radius: 0.3rem;
    }

    :global(._markdown thead th:last-child) {
        border-top-right-radius: 0.3rem;
        border-right: unset;
    }

    :global(._markdown tbody tr:nth-child(odd)) {
        background-color: color-mix(in srgb, var(--secondary), var(--tertiary) 20%);
    }

    :global(._markdown tbody) {
        background-color: var(--secondary);
    }

    :global(._markdown td) {
        padding: 0.2rem 0.4rem;
        border: 0.1rem solid var(--tertiary);
    }

    :global(._markdown td:first-child) {
        border-left: unset;
    }

    :global(._markdown td:last-child) {
        border-right: unset;
    }

    :global(._markdown tr:last-child td) {
        border-bottom: unset;
    }

    :global(._markdown ul, ._markdown ol) {
        padding-left: 1rem;
    }

    :global(._markdown li:not(:last-child)) {
        margin-bottom: 0.5rem;
    }

    :global(._markdown p),
    :global(._markdown ul),
    :global(._markdown ol) {
        line-height: 1.5;
        font-family: 'Noto Serif', Rubik, sans-serif;
        font-weight: 500;
        width: min(100%, 70ch);
        margin: 0 var(--md-inline-margin, auto);
    }

    :global(.markdown-body h1),
    :global(.markdown-body h2),
    :global(.markdown-body h3),
    :global(.markdown-body h4),
    :global(.markdown-body h5),
    :global(.markdown-body h6) {
        width: min(100%, 46rem);
        margin: 0 var(--md-inline-margin, auto);
    }

    :global(.markdown-body h1:not(:first-child)),
    :global(.markdown-body h2:not(:first-child)) {
        margin-top: 2rem;
        margin-bottom: 0;
    }

    /* no frame of its own: the embed's cards sit on the page as its sections do, apart by the same
       small gap (the embed pads itself by it when a page of ours frames it) */
    :global(._markdown .code-playground) {
        box-sizing: border-box;
        border: none;
        border-radius: 0.8rem;
        width: 100%;
        min-height: 21.4rem;
        margin: 1.5rem var(--md-inline-margin, auto);
        background-color: var(--secondary);
        box-shadow: none;
    }
    :global(._markdown .code-playground:first-child) {
        margin: 0 var(--md-inline-margin, auto);
    }

    /* what a prerendered page carries in place of a playground, until the client swaps the iframe
       in: the lecture's worked example as readable, crawlable code. Same box as the iframe, so the
       swap moves nothing - the height matches the min-height above, and a fence that asks for a
       taller one overrides both inline. The listing itself scrolls inside that box.

       `font-family: inherit` is what keeps the two the same width, and is not cosmetic: both carry
       the same inline `max-width: 70ch`, and a `ch` is the width of a `0` in the element's OWN
       font. A `<pre>` defaults to monospace and an `<iframe>` inherits the lecture's Noto Serif, so
       leaving the default in place measured the same 70 characters against two different fonts and
       the block came out visibly narrower than the editor replacing it. The monospace goes on the
       code inside, where it belongs, and never reaches the box that does the measuring. */
    :global(pre.code-playground) {
        box-sizing: border-box;
        height: 21.4rem;
        /* the iframe's own height, a tall fence's 80dvh included, and not a code block's 60vh */
        max-height: none;
        min-width: 0;
        max-width: none;
        padding: 0.4rem 1rem;
        overflow: auto;
        font-family: inherit;
    }

    /* a collapsed block of a lecture (an Exercise's solution): an expanding item in the same centered
       column as the text and the playgrounds around it, the summary alone when closed, the frame
       around everything when open */
    :global(._markdown details) {
        box-sizing: border-box;
        width: min(100%, 70ch);
        margin: 0 var(--md-inline-margin, auto);
        border: solid 0.1rem var(--tertiary);
        border-radius: 0.8rem;
        overflow: hidden;
    }

    :global(._markdown details.wide) {
        width: 100%;
    }

    :global(._markdown summary) {
        padding: 0.6rem 1rem;
        background-color: var(--secondary);
        font-family: Rubik, sans-serif;
        font-weight: bold;
        cursor: pointer;
        user-select: none;
    }

    :global(._markdown details[open] > summary) {
        border-bottom: solid 0.1rem var(--tertiary);
    }

    :global(._markdown details > :not(summary)) {
        margin: 1rem;
    }

    :global(._markdown .code-playground.in-details) {
        width: 100%;
        margin: 0;
        border-radius: 0rem !important;
        display: block;
        box-shadow: none;
    }

    :global(._markdown pre.code-playground.in-details) {
        display: flex;
    }

    :global(.simple-code pre.code-block) {
        margin: 0 !important;
        width: unset !important;
        max-width: unset !important;
        min-width: unset !important;
        box-shadow: unset !important;
    }

    :global(.simple-code pre.code-block > .code-gutter) {
        margin-left: 0;
    }
</style>
