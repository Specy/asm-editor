<script lang="ts">
    /**
     * Markdown as the app shows it: rendered once by [the pipeline](../../../lib/content/markdown.ts),
     * the same way in the server render and in the browser, so the prerendered page is what its
     * reader keeps. Once mounted, each **Playground** swaps its embed in for the code block the
     * render left, and a host that asks colours the remaining code blocks with Monaco
     * ([ADR 0053](../../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
     */
    import { renderMarkdown, type MarkdownOptions } from '#lib/content/markdown.ts'
    import { playgroundEmbedUrl, playgroundTitle } from '#lib/content/markdownPlaygrounds.ts'
    import { isEmbedBuiltMessage, isEmbedReadyMessage } from '#lib/content/embedMessages.ts'
    import { colourCodeBlocksWithMonaco } from '#lib/content/monacoCodeBlocks.ts'
    import { DUR_FAST, motion } from '#src/styles/motion.ts'
    import { codeBlockStyle } from '#lib/content/codeBlockStyle.ts'
    import { generateTheme } from '#lib/monaco/editorTheme.ts'
    import { ScopedTheme } from '#stores/themeStore.svelte.ts'
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
     * Each marked playground's embed, in place of the code block the render left, inside the box
     * they share (`playground-slot`, markdownPlaygrounds.ts). Built here rather than in the render,
     * so a page that runs no scripts, and a crawler, read the worked example as code.
     *
     * Each embed boots a whole editor, on this page's own main thread (the frame is ours), so it is
     * built only once its code block has stayed within half a screen of the view for a moment
     * (`DWELL_MS`): a reader is not held up by the editors further down, nor by those a fast scroll
     * passes, and one inside a closed `<details>` (an Exercise's solution) waits for it to open.
     */
    $effect(() => {
        void html
        if (!content) return
        const marked = content.querySelectorAll<HTMLElement>('[data-playground]')
        if (marked.length === 0) return
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timers of this render's observer; nothing renders from it.
        const dwelling = new Map<Element, ReturnType<typeof setTimeout>>()
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    clearTimeout(dwelling.get(entry.target))
                    dwelling.delete(entry.target)
                    if (!entry.isIntersecting) continue
                    const target = entry.target as HTMLElement
                    dwelling.set(
                        target,
                        setTimeout(() => {
                            dwelling.delete(target)
                            observer.unobserve(target)
                            embedPlayground(target)
                        }, DWELL_MS)
                    )
                }
            },
            { rootMargin: '50% 0px' }
        )
        for (const element of marked) observer.observe(element)
        return () => {
            observer.disconnect()
            for (const timer of dwelling.values()) clearTimeout(timer)
            //the frames still loading belong to the text being replaced or to a renderer going away
            for (const frame of loadingFrames.values()) frame.dispose()
            loadingFrames.clear()
        }
    })

    /** How long a code block stays near the view before its embed is built. */
    const DWELL_MS = 300

    /**
     * How long a frame whose page has loaded may take to say its editor is ready before it is shown
     * anyway: an embed whose emulator failed to load shows why, which the code block would hide.
     */
    const READY_TIMEOUT_MS = 15_000

    /** The frames still loading behind their code blocks: how each takes its block's place. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Read by the message listener and the observer's cleanup; nothing renders from it.
    const loadingFrames = new Map<HTMLIFrameElement, { takePlace(): void; dispose(): void }>()

    /**
     * The marked code block's embed. Its code stays on screen, readable and copyable, while the
     * embed loads: the frame waits in the same box, over it, unseen and out of reach (`inert`), and
     * the box shows a spinner (`aria-busy`). When its editor says it is ready (`embedMessages.ts`)
     * it fades in over the block in a moment, which hides what little still differs (the current
     * line's highlight, the Build bar), and the block goes. The frame never moves, which would load
     * it again.
     */
    function embedPlayground(marked: HTMLElement) {
        const slot = marked.parentElement
        if (!marked.isConnected || !slot?.classList.contains('playground-slot')) return
        const info = marked.dataset.playground ?? ''
        const src = playgroundEmbedUrl({
            info,
            code:
                marked.tagName === 'PRE'
                    ? (marked.querySelector(':scope > code')?.textContent?.trimEnd() ?? '')
                    : '',
            testcases: marked.dataset.testcases,
            program: marked.dataset.program
        })
        if (!src) return
        const iframe = document.createElement('iframe')
        //the embed wears this page's theme, its language's on a Language course, the reader's own
        //on a blog post, so it looks like the block it replaces (`theme`, routes/embed)
        const theme = `&theme=${encodeURIComponent(ScopedTheme.id ?? 'none')}`
        iframe.title = playgroundTitle(info)
        iframe.inert = true
        iframe.dataset.loading = ''
        slot.setAttribute('aria-busy', 'true')

        let timer: ReturnType<typeof setTimeout> | undefined
        let settled = false
        const settle = () => {
            if (settled) return
            settled = true
            iframe.style.removeProperty('transition')
            delete iframe.dataset.loading
            iframe.inert = false
            marked.remove()
        }
        const takePlace = () => {
            clearTimeout(timer)
            if (!loadingFrames.delete(iframe)) return
            slot.removeAttribute('aria-busy')
            const duration = motion(DUR_FAST)
            if (duration === 0) return settle()
            iframe.style.transition = `opacity ${duration}ms ease-out`
            delete iframe.dataset.loading
            iframe.addEventListener('transitionend', settle, { once: true })
            setTimeout(settle, duration + 100)
        }
        loadingFrames.set(iframe, { takePlace, dispose: () => clearTimeout(timer) })
        iframe.addEventListener('load', () => (timer = setTimeout(takePlace, READY_TIMEOUT_MS)), {
            once: true
        })
        iframe.src = src + theme
        slot.append(iframe)
    }

    $effect(() => {
        const ready = (event: MessageEvent) => {
            if (!isEmbedReadyMessage(event.data)) return
            for (const [iframe, frame] of loadingFrames) {
                if (iframe.contentWindow === event.source) frame.takePlace()
            }
        }
        window.addEventListener('message', ready)
        return () => window.removeEventListener('message', ready)
    })

    /**
     * A playground whose panels wait for a Build starts as short as its code, and its box takes
     * the height its fence asked for (`data-built-height`) while its embed says the program is
     * built ([embedMessages.ts](../../../lib/content/embedMessages.ts)).
     */
    $effect(() => {
        if (!content) return
        const frames = content
        const resize = (event: MessageEvent) => {
            if (!isEmbedBuiltMessage(event.data)) return
            for (const slot of frames.querySelectorAll<HTMLElement>(
                '.playground-slot[data-built-height]'
            )) {
                if (slot.querySelector('iframe')?.contentWindow !== event.source) continue
                slot.style.height = event.data.built ? (slot.dataset.builtHeight ?? '') : ''
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

    /* a heading opened by its id lands below the fixed navbar rather than under it, as every
       anchor in the app does (--anchor-offset) */
    .heading-ids :global(h2[id]),
    .heading-ids :global(h3[id]) {
        scroll-margin-top: var(--anchor-offset);
    }

    :global(._markdown pre.code-block:not(.code-playground)) {
        margin: 1rem 0;
    }

    :global(._markdown .markdown-body) {
        /* about 70 characters of the text, the same for the headings (see global.css) */
        --md-text-width: 38em;
        display: flex;
        flex-direction: column;
        gap: var(--gap, 1rem);
    }

    :global(._markdown p) {
        color: var(--background-text-prose);
    }

    /* a link reads as one, as the Documentation's entries and the Markdown preview mark theirs:
       the page's own links take the text's colour, which would leave these looking like text */
    :global(._markdown a) {
        color: var(--accent);
        text-decoration: underline;
    }

    :global(._markdown table) {
        border-collapse: collapse;
        overflow-x: auto;
        display: block;
        margin: 0.5rem var(--md-inline-margin, auto);
        font-family: var(--font-mono);
        border-radius: 0.5rem;
        border: solid 1px var(--tertiary);
        width: fit-content;
        max-width: 100%;
    }

    :global(._markdown code:not(pre code)) {
        font-family: var(--font-mono);
        background: var(--secondary);
        padding: 0.2rem 0.4rem;
        border-radius: var(--r-chip);
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
        border-right: 1px solid var(--secondary);
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
        border: 1px solid var(--tertiary);
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
        font-family: var(--font-read);
        font-weight: 500;
        width: min(100%, var(--md-text-width));
        margin: 0 var(--md-inline-margin, auto);
    }

    /* the paragraphs' column, so a heading starts where its text does, centred or not */
    :global(.markdown-body h1),
    :global(.markdown-body h2),
    :global(.markdown-body h3),
    :global(.markdown-body h4),
    :global(.markdown-body h5),
    :global(.markdown-body h6) {
        width: min(100%, var(--md-text-width));
        margin: 0 var(--md-inline-margin, auto);
    }

    :global(.markdown-body h1:not(:first-child)),
    :global(.markdown-body h2:not(:first-child)) {
        margin-top: 2rem;
        margin-bottom: 0;
    }

    /* The box a playground occupies (`playground-slot`, markdownPlaygrounds.ts): the code block the
       render leaves fills it, and once mounted the embed's frame waits over the block inside it and
       takes its place, so the swap moves nothing around it. A fence that asks for a height writes
       it inline, and the box grows to `data-built-height` while a program is built. Its width is
       the inline `max-width: 70ch` in the page's own font, the frame's: a `ch` is the width of a
       `0` in the element's own font, and a monospace box came out visibly narrower than the frame
       replacing it. No frame of its own: the embed's cards sit on the page as its sections do. */
    :global(._markdown .playground-slot) {
        position: relative;
        box-sizing: border-box;
        width: 100%;
        height: 21.4rem;
        margin: 1.5rem var(--md-inline-margin, auto);
    }
    :global(._markdown .playground-slot:first-child) {
        margin: 0 var(--md-inline-margin, auto);
    }
    /* in a collapsed block (an Exercise's solution), which is itself the column and the frame */
    :global(._markdown .playground-slot.in-details) {
        margin: 0;
    }
    :global(._markdown .playground-slot > iframe) {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        border: none;
        background: transparent;
    }
    /* loading, over the code block: unseen and out of reach until its editor is ready, when it
       fades in (MarkdownRenderer's `takePlace`) */
    :global(._markdown .playground-slot > iframe[data-loading]) {
        opacity: 0;
        pointer-events: none;
    }

    /* a spinner at the code's top right while the editor loads: the app's spinner icon turning
       once a second, in the muted text colour, as `Spinner` draws it */
    :global(._markdown .playground-slot[aria-busy='true']::after) {
        content: '';
        position: absolute;
        top: calc(0.25rem + 0.5rem);
        right: calc(0.25rem + 0.6rem);
        width: 1rem;
        height: 1rem;
        background-color: color-mix(in srgb, var(--secondary-text) 68%, transparent);
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M304 48c0 26.51-21.49 48-48 48s-48-21.49-48-48s21.49-48 48-48s48 21.49 48 48m-48 368c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48s-21.49-48-48-48m208-208c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48s-21.49-48-48-48M96 256c0-26.51-21.49-48-48-48S0 229.49 0 256s21.49 48 48 48s48-21.49 48-48m12.922 99.078c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48c0-26.509-21.491-48-48-48m294.156 0c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48c0-26.509-21.49-48-48-48M108.922 60.922c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48s-21.491-48-48-48'/%3E%3C/svg%3E")
            center / contain no-repeat;
        animation: playground-spinner 1s linear infinite;
    }
    @keyframes -global-playground-spinner {
        to {
            transform: rotate(360deg);
        }
    }

    /* The code block, drawn as the embed's own card so that the editor replacing it looks like the
       same block coming to life: the embed pads itself by the Playground's gap (0.25rem, `--wb-gap`
       in cards.css) when a page of ours frames it, and draws its code card with a 1px edge in the
       line colour and a control's corners. A transparent border gives the gap without changing the
       box, the background stops inside it, and an inset ring draws the edge; the code then starts
       1px inside that edge, where Monaco's first line and its gutter are (the gutter itself is
       Monaco's, `code-gutter-spacing`). It scrolls inside the box. A playground with named files
       (every C or C++ one) is a `div` holding each file's name and code. */
    :global(._markdown :is(pre, div).code-playground) {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        min-width: 0;
        max-width: none;
        max-height: none;
        margin: 0;
        overflow: auto;
        border: 0.25rem solid transparent;
        border-radius: calc(var(--r-control) + 0.25rem);
        background-color: var(--secondary);
        background-clip: padding-box;
        box-shadow: inset 0 0 0 1px var(--line);
    }
    :global(._markdown pre.code-playground) {
        padding: 1px 1rem 0.4rem calc(1rem + 1px);
    }
    :global(._markdown div.code-playground) {
        padding: 1px;
    }

    /* a named file, as the embed's tab strip shows it over the code (TabStrip's `strip` look): a
       2rem band a shade darker than the card, ruled underneath, the file's tab in the card's colour
       and open at the bottom onto it, ruled on its right */
    :global(._markdown div.code-playground > .playground-filename) {
        display: flex;
        height: 2rem;
        padding: 0;
        background: color-mix(in srgb, var(--background) 65%, var(--secondary));
        border-bottom: 1px solid var(--line);
        color: var(--secondary-text);
        font-family: var(--font-ui);
        font-size: var(--fs-small);
    }
    :global(._markdown div.code-playground > .playground-filename > span) {
        display: flex;
        align-items: center;
        margin-bottom: -1px;
        padding: 0 1rem;
        background: var(--secondary);
        border-right: 1px solid var(--line);
        border-bottom: 1px solid var(--secondary);
    }
    /* its code under the strip, where Monaco's lines start: the card is the block's */
    :global(._markdown div.code-playground > pre.code-block) {
        margin: 0;
        padding: 0 1rem 0.4rem;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
    }

    /* a collapsed block of a lecture (an Exercise's solution): an expanding item in the same centered
       column as the text and the playgrounds around it, the summary alone when closed, the frame
       around everything when open */
    :global(._markdown details) {
        box-sizing: border-box;
        width: min(100%, var(--md-text-width));
        margin: 0 var(--md-inline-margin, auto);
        border: solid 1px var(--tertiary);
        border-radius: 0.8rem;
        overflow: hidden;
    }

    :global(._markdown details.wide) {
        width: 100%;
    }

    :global(._markdown summary) {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.6rem 1rem 0.6rem 0.6rem;
        background-color: var(--secondary);
        font-family: var(--font-ui);
        font-weight: 700;
        cursor: pointer;
        user-select: none;
        list-style: none;
    }
    :global(._markdown summary::-webkit-details-marker) {
        display: none;
    }
    /* the browser's triangle replaced by the app's rounded chevron (Material's round
       keyboard-arrow-right, as the Select's is), turned down while the block is open (owner,
       2026-11-09) */
    :global(._markdown summary::before) {
        content: '';
        flex: none;
        width: 1.25em;
        height: 1.25em;
        background-color: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9.29 15.88L13.17 12L9.29 8.12a.996.996 0 1 1 1.41-1.41l4.59 4.59c.39.39.39 1.02 0 1.41L10.7 17.3a.996.996 0 0 1-1.41 0c-.38-.39-.39-1.03 0-1.42'/%3E%3C/svg%3E")
            center / contain no-repeat;
        opacity: 0.8;
        transition: transform var(--dur-base) ease;
    }
    :global(._markdown details[open] > summary::before) {
        transform: rotate(90deg);
    }

    :global(._markdown details[open] > summary) {
        border-bottom: solid 1px var(--tertiary);
    }

    :global(._markdown details > :not(summary)) {
        margin: 1rem;
    }
    /* the text inside the frame fills it up to that inset: the column's width above is
       `min(100%, …)`, which inside a frame narrower than the column is the frame's whole width,
       and the inset's margins on top of it pushed the lines out past the right edge */
    :global(._markdown details > :is(p, ul, ol, h1, h2, h3, h4, h5, h6)) {
        width: auto;
    }

    /* `simpleCode`, compact code (a Documentation entry, a lecture's card or an instruction in the
       panel, a note under an editor line): no room round it and the width of what holds it. `!important`, as markdownPlaygrounds.ts writes
       a playground fence's margin and max-width inline, which only it beats; it beats a caller's
       rule too, so a caller sets none of these */
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
