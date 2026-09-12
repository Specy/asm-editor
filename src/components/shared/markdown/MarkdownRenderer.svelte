<script lang="ts" module>
    import type { Plugin } from 'carta-md'
    import { Carta } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import remarkGfm from 'remark-gfm'
    import rehypeExternalLinks from 'rehype-external-links'
    import '@cartamd/plugin-code/default.css'
    import { code } from '@cartamd/plugin-code'
    import type { Element, Parent, Root, RootContent } from 'hast'
    import { visit } from 'unist-util-visit'
    import type { Testcase } from '$lib/Project.svelte'
    import lzstring from 'lz-string'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { serializer } from '$lib/json'
    import {
        isTestcaseFence,
        parsePlaygroundFence,
        parseTestcaseFence,
        type PlaygroundFence,
        type PlaygroundSettings
    } from '$lib/content/playgrounds'
    let isDark = $derived(ThemeStore.isColorDark(ThemeStore.theme.background.color))

    let theme = $derived(isDark ? ('one-dark-pro' as const) : ('one-light' as const))

    type Settings = PlaygroundSettings

    function createCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        const showMemory = settings.showMemory ? 'showMemory=true&' : ''
        const showConsole = settings.showConsole ? 'showConsole=true&' : ''
        const showTests = settings.showTests ? 'showTests=true&' : 'showTests=false&'
        const showPc = settings.showPc ? 'showPc=true&' : ''
        const showRegisters = settings.showRegisters
            ? 'showRegisters=true&'
            : 'showRegisters=false&'
        const showFlags = settings.showFlags ? 'showFlags=true&' : 'showFlags=false&'
        const showScreen = settings.showScreen ? 'showScreen=true&' : ''
        const openScreen = settings.openScreen ? 'openScreen=true&' : ''
        const showOpenButton = settings.openButton ? 'openButton=true&' : ''
        const props = [
            showMemory,
            showConsole,
            showTests,
            showPc,
            showRegisters,
            showFlags,
            showScreen,
            openScreen,
            showOpenButton
        ].join('')
        const lang = `language=${settings.language}&`
        const compressed = lzstring.compressToEncodedURIComponent(code)
        const tests =
            testcases.length > 0
                ? `testcases=${lzstring.compressToEncodedURIComponent(serializer.stringify($state.snapshot(testcases)))}&`
                : ''
        return `/embed?${lang}${props}${tests}code=${compressed}`
    }

    /** The fence info string of a `<pre><code class="language-...">`, when it has one. */
    function fenceInfoOf(node: RootContent): string | undefined {
        if (node.type !== 'element' || node.tagName !== 'pre') return undefined
        const codeNode = node.children?.find(
            (child): child is Element => child.type === 'element' && child.tagName === 'code'
        )
        if (!codeNode?.properties || !Array.isArray(codeNode.properties.className)) return undefined
        const langClass = codeNode.properties.className.find(
            (cls): cls is string => typeof cls === 'string' && cls.startsWith('language-')
        )
        return langClass?.substring('language-'.length)
    }

    function textOf(node: RootContent): string {
        if (node.type === 'text') return node.value
        if ('children' in node && Array.isArray(node.children)) {
            return (node.children as RootContent[]).map(textOf).join('')
        }
        return ''
    }

    /** The next node that is not whitespace between two blocks. */
    function nextBlock(
        children: RootContent[],
        from: number
    ): { node: RootContent; index: number } | undefined {
        for (let cursor = from + 1; cursor < children.length; cursor++) {
            const node = children[cursor]
            if (node.type === 'comment') continue
            if (node.type === 'text' && node.value.trim().length === 0) continue
            return { node, index: cursor }
        }
        return undefined
    }

    /**
     * The testcases of a `testcase` fence attached to a playground. A malformed one is an authoring
     * mistake, so it is announced in the console and the playground renders without it rather than
     * taking the page down with it. The console line carries what the renderer can see of the page:
     * the fence, the JSON and, in the browser, the lecture's own address.
     */
    function attachedTestcases(node: RootContent, info: string): Testcase[] {
        const raw = textOf(node)
        try {
            return [parseTestcaseFence(raw).testcase]
        } catch (e) {
            const where = typeof window === 'undefined' ? '' : ` on ${window.location.pathname}`
            console.error(
                `Malformed testcase fence${where}, after the "${info}" playground: ${(e as Error).message}\n${raw}`
            )
            return []
        }
    }

    function playgroundIframe(
        node: Element,
        fence: PlaygroundFence,
        testcases: Testcase[],
        parent: Parent
    ): Element {
        const codeNode = node.children?.find(
            (child): child is Element => child.type === 'element' && child.tagName === 'code'
        )
        const { large, tall } = fence
        //inside a collapsed block (an Exercise's solution) the block itself is the centered column and
        //the frame, so the iframe fills it instead of placing itself; a large playground widens the block
        const details =
            parent.type === 'element' && (parent as Element).tagName === 'details'
                ? (parent as Element)
                : undefined
        if (details && large) {
            const className = details.properties?.className
            details.properties = {
                ...details.properties,
                className: [...(Array.isArray(className) ? className : []), 'wide']
            }
        }
        const placement = details || large ? '' : 'max-width: 70ch; margin: 1.5rem auto;'
        const height = tall
            ? 'height: 80dvh;'
            : fence.settings.showScreen
              ? 'height: min(40rem, 85vh);'
              : ''
        return {
            type: 'element',
            tagName: 'iframe',
            properties: {
                style: `${placement} ${height}`.trim(),
                className: details ? ['code-playground', 'in-details'] : ['code-playground'],
                //each embed boots a whole editor, so a lecture with five of them would boot five
                //before the reader has scrolled to the second; `loading` is in DOMPurify's default
                //attribute list, so the sanitizer keeps it
                loading: 'lazy',
                src: createCodeUrl(textOf(codeNode ?? node).trimEnd(), fence.settings, testcases)
            },
            children: []
        }
    }

    /**
     * Replaces every playground fence with its embed iframe and drops the `testcase` fences, which
     * are instructions to the embed and to the verification test and are never shown to a reader.
     * The children of a block are rebuilt rather than patched in place, so a testcase and the blank
     * line before it leave together.
     */
    function transformPlaygrounds(parent: Parent): void {
        const children = parent.children as RootContent[]
        const result: RootContent[] = []
        for (let index = 0; index < children.length; index++) {
            const node = children[index]
            const info = fenceInfoOf(node)
            const fence = info === undefined ? undefined : parsePlaygroundFence(info)
            if (fence && node.type === 'element') {
                let testcases: Testcase[] = []
                const following = nextBlock(children, index)
                const followingInfo = following && fenceInfoOf(following.node)
                if (following && followingInfo !== undefined && isTestcaseFence(followingInfo)) {
                    testcases = attachedTestcases(following.node, info as string)
                    //the testcase block and the whitespace before it go with the playground
                    index = following.index
                }
                result.push(playgroundIframe(node, fence, testcases, parent))
                continue
            }
            //a testcase fence that attached to nothing is still not something a reader should read
            if (info !== undefined && isTestcaseFence(info)) continue
            if (node.type === 'element') transformPlaygrounds(node)
            result.push(node)
        }
        parent.children = result
    }

    const rehypePlaygroundTransformer = () => (tree: Root) => {
        transformPlaygrounds(tree)
    }

    const customPlaygroundPlugin: Plugin = {
        transformers: [
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(rehypePlaygroundTransformer)
                }
            }
        ]
    }

    const rehypeDisableLinksTransformer = () => (tree: Root) => {
        visit(tree, 'element', (node: Element, index?: number, parent?: Parent) => {
            if (node.tagName !== 'a' || typeof index !== 'number' || !parent) return
            parent.children.splice(index, 1, ...node.children)
        })
    }

    function sanitizeMarkdownHtml(html: string, disableLinks = false) {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['iframe'],
            ...(disableLinks ? { FORBID_TAGS: ['a'] } : {})
        })
    }

    const ext: Plugin = {
        transformers: [
            {
                execution: 'async',
                type: 'rehype',
                async transform({ carta }) {
                    const highlighter = await carta.highlighter()
                    if (!highlighter) return
                    await highlighter.shikiHighlighter().loadTheme(theme)
                }
            },
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(remarkGfm).use(rehypeRaw)
                }
            }
        ]
    }
    const extWithExternalLins: Plugin = {
        transformers: [
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(remarkGfm).use(rehypeRaw).use(rehypeExternalLinks, {
                        target: '_blank'
                    })
                }
            }
        ]
    }
    const extWithoutLinks: Plugin = {
        transformers: [
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(remarkGfm).use(rehypeRaw).use(rehypeDisableLinksTransformer)
                }
            }
        ]
    }
    const cartaNormal = $derived(
        new Carta({
            sanitizer: (html) => {
                return sanitizeMarkdownHtml(html)
            },
            extensions: [
                ext,
                customPlaygroundPlugin,
                code({ theme, langs: ['mips', 'riscv', 'asm'] })
            ],
            rehypeOptions: {
                allowDangerousHtml: true
            },
            shikiOptions: {
                themes: [theme]
            }
        })
    )
    const cartaWithExternalLins = $derived(
        new Carta({
            sanitizer: (html) => {
                return sanitizeMarkdownHtml(html)
            },
            extensions: [
                extWithExternalLins,
                customPlaygroundPlugin,
                code({ theme, langs: ['mips', 'riscv', 'asm'] })
            ],
            rehypeOptions: {
                allowDangerousHtml: true
            },
            shikiOptions: {
                themes: [theme]
            }
        })
    )
    const cartaWithoutLinks = $derived(
        new Carta({
            sanitizer: (html) => {
                return sanitizeMarkdownHtml(html, true)
            },
            extensions: [
                extWithoutLinks,
                customPlaygroundPlugin,
                code({ theme, langs: ['mips', 'riscv', 'asm', 'c'] })
            ],
            rehypeOptions: {
                allowDangerousHtml: true
            },
            shikiOptions: {
                themes: [theme]
            }
        })
    )
</script>

<script lang="ts">
    import { Markdown } from 'carta-md'

    interface Props {
        source: string
        linksInNewTab?: boolean
        style?: string
        spacing?: string
        simpleCode?: boolean
        disableLinks?: boolean
    }

    let { source, linksInNewTab, style, spacing, simpleCode, disableLinks }: Props = $props()

    const carta = $derived(
        disableLinks ? cartaWithoutLinks : linksInNewTab ? cartaWithExternalLins : cartaNormal
    )
</script>

<div class="_markdown" class:simple-code={simpleCode} {style} style:--gap={spacing}>
    {#key source + theme + disableLinks}
        <Markdown value={source} {carta} />
    {/key}
</div>

<style lang="scss">
    ._markdown {
        display: flex;
        flex-direction: column;
        line-height: 1.4;
        letter-spacing: 0.01em;
    }

    :global(pre:has(code)) {
        width: 100%;
        background: var(--secondary) !important;
        padding: 1rem;
        border-radius: 0.5rem;
        overflow-x: auto;
        max-width: fit-content;
        padding: 0.5rem 1rem;
        min-width: min(100%, 72ch);
        margin: 1rem auto;
        box-shadow: 0 0 2rem 10px rgb(3 4 5 / 15%);
    }

    :global(.shiki) {
        padding: 0.5rem;
        border-radius: 0.3rem;
        width: 100%;
        max-width: fit-content;
        padding: 0.5rem 1rem;
        min-width: min(100%, 72ch);
        margin: 1rem auto;
        box-shadow: 0 0 2rem 10px rgb(3 4 5 / 15%);
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
        margin: 0.5rem auto;
        font-family: 'Fira Code', monospace;
        border-radius: 0.5rem;
        border: solid 0.1rem var(--tertiary);
        width: fit-content;
        max-width: 100%;
    }

    :global(._markdown code:not(pre code)) {
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
        margin: 1rem auto;
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
        margin: 0 auto;
    }

    :global(.markdown-body h1),
    :global(.markdown-body h2),
    :global(.markdown-body h3),
    :global(.markdown-body h4),
    :global(.markdown-body h5),
    :global(.markdown-body h6) {
        width: min(100%, 46rem);
        margin: 0 auto;
    }

    :global(.markdown-body h1:not(:first-child)),
    :global(.markdown-body h2:not(:first-child)) {
        margin-top: 2rem;
        margin-bottom: 0;
    }

    :global(.code-playground) {
        border: none;
        border-radius: 0.8rem;
        width: 100%;
        min-height: 21.4rem;
        margin: 1.5rem auto;
        background-color: var(--secondary);
        box-shadow: 0 0 2rem 10px rgba(0, 0, 0, 0.2);
    }
    :global(.code-playground:first-child) {
        margin: 0 auto;
    }

    /* a collapsed block of a lecture (an Exercise's solution): an expanding item in the same centered
       column as the text and the playgrounds around it, the summary alone when closed, the frame
       around everything when open */
    :global(._markdown details) {
        box-sizing: border-box;
        width: min(100%, 70ch);
        margin: 0 auto;
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

    :global(.simple-code .shiki) {
        border-radius: 0;
        background-color: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        width: unset !important;
        max-width: unset !important;
        min-width: unset !important;
        box-shadow: unset !important;
    }
</style>
