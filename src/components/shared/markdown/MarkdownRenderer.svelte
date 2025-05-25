<script lang="ts" module>
    import type { Plugin } from 'carta-md'
    import { Carta } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import remarkGfm from 'remark-gfm'
    import rehypeExternalLinks from 'rehype-external-links'
    import '@cartamd/plugin-code/default.css'
    import { code } from '@cartamd/plugin-code'
    import type { Element, Parent, Root } from 'hast'
    import { visit } from 'unist-util-visit'
    import type { AvailableLanguages, Testcase } from '$lib/Project.svelte'
    import lzstring from 'lz-string'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { serializer } from '$lib/json'
    let isDark = $derived(ThemeStore.isColorDark(ThemeStore.theme.background.color))

    let theme = $derived(isDark ? ('one-dark-pro' as const) : ('one-light' as const))

    type Settings = {
        showMemory: boolean
        language: AvailableLanguages
        showConsole: boolean
        showTests: boolean
        showPc: boolean
        showRegisters: boolean
        showFlags: boolean
        openButton: boolean
    }

    function createCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        const showMemory = settings.showMemory ? 'showMemory=true&' : ''
        const showConsole = settings.showConsole ? 'showConsole=true&' : ''
        const showTests = settings.showTests ? 'showTests=true&' : 'showTests=false&'
        const showPc = settings.showPc ? 'showPc=true&' : ''
        const showRegisters = settings.showRegisters
            ? 'showRegisters=true&'
            : 'showRegisters=false&'
        const showFlags = settings.showFlags ? 'showFlags=true&' : 'showFlags=false&'
        const showOpenButton = settings.openButton ? 'openButton=true&' : ''
        const props = [
            showMemory,
            showConsole,
            showTests,
            showPc,
            showRegisters,
            showFlags,
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

    const rehypePlaygroundTransformer = () => (tree: Root) => {
        visit(tree, 'element', (node: Element, index?: number, parent?: Parent) => {
            if (node.tagName === 'pre') {
                const codeNode = node.children?.find(
                    (child): child is Element =>
                        child.type === 'element' && child.tagName === 'code'
                )

                if (codeNode?.properties && Array.isArray(codeNode.properties.className)) {
                    const langClass = codeNode.properties.className.find(
                        (cls): cls is string =>
                            typeof cls === 'string' && cls.startsWith('language-')
                    )

                    if (langClass) {
                        const fullLanguage = langClass.substring('language-'.length)
                        const entries = fullLanguage.split('|')
                        const isPlayground = entries.includes('playground')
                        const showMemory = entries.includes('memory')
                        const showConsole = entries.includes('console')
                        const showTests = entries.includes('tests')
                        const showPc = entries.includes('pc')
                        const showRegisters = !entries.includes('no-registers')
                        const showFlags = !entries.includes('no-flags')
                        const large = entries.includes('large') || showMemory
                        const tall = entries.includes('tall')
                        const openButton = entries.includes('allow-open')
                        if (isPlayground) {
                            let actualLanguage = entries[0].toUpperCase()
                            if (actualLanguage === 'RISCV') {
                                actualLanguage = 'RISC-V'
                            }
                            if(actualLanguage === 'riscv64'){
                                actualLanguage = 'RISC-V-64'
                            }

                            const getAllText = (
                                n: import('hast').Node | import('hast').Parent
                            ): string => {
                                //@ts-ignore
                                if (n.type === 'text') return n.value as string
                                if ('children' in n && Array.isArray(n.children)) {
                                    return (
                                        n.children as Array<
                                            import('hast').Node | import('hast').Parent
                                        >
                                    )
                                        .map(getAllText)
                                        .join('')
                                }
                                return ''
                            }
                            if (parent && typeof index === 'number' && parent.children) {
                                // Replace the <pre> node with our placeholder <div>
                                const placeholder: Element = {
                                    type: 'element',
                                    tagName: 'iframe',
                                    properties: {
                                        style: `
                                        	${!large ? 'max-width: 70ch; margin: 1.5rem auto;' : ''}
                                        	${tall ? 'height: 80dvh;' : ''}
                                        `,
                                        className: 'code-playground',
                                        src: createCodeUrl(
                                            getAllText(codeNode).trimEnd(),
                                            {
                                                showMemory,
                                                showConsole,
                                                showTests,
                                                showPc,
                                                showRegisters: showRegisters,
                                                showFlags,
                                                language: actualLanguage as AvailableLanguages,
                                                openButton
                                            },
                                            []
                                        )
                                    },
                                    children: []
                                }
                                parent.children[index] = placeholder
                            }
                        }
                    }
                }
            }
        })
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

    const ext: Plugin = {
        transformers: [
            {
                execution: 'async',
                type: 'rehype',
                async transform({ carta }) {
                    const highlighter = await carta.highlighter()
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
    const cartaNormal = new Carta({
        sanitizer: (html) => {
            return DOMPurify.sanitize(html, {
                ADD_TAGS: ['iframe']
            })
        },
        extensions: [ext, customPlaygroundPlugin, code({ theme, langs: ['mips', 'riscv', 'asm'] })],
        rehypeOptions: {
            allowDangerousHtml: true
        }
    })
    const cartaWithExternalLins = new Carta({
        sanitizer: (html) => {
            return DOMPurify.sanitize(html, {
                ADD_TAGS: ['iframe']
            })
        },
        extensions: [
            extWithExternalLins,
            customPlaygroundPlugin,
            code({ theme, langs: ['mips', 'riscv', 'asm'] })
        ],
        rehypeOptions: {
            allowDangerousHtml: true
        }
    })
</script>

<script lang="ts">
    import { Markdown } from 'carta-md'

    interface Props {
        source: string
        linksInNewTab?: boolean
        style?: string
        spacing?: string
        simpleCode?: boolean
    }

    let { source, linksInNewTab, style, spacing, simpleCode }: Props = $props()

    const carta = linksInNewTab ? cartaWithExternalLins : cartaNormal
</script>

<div class="_markdown" class:simple-code={simpleCode} {style} style:--gap={spacing}>
    {#key source + theme}
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
    }

    :global(.shiki) {
        padding: 0.5rem;
        border-radius: 0.3rem;
        width: 100%;
    }

    :global(.shiki),
    :global(pre:has(code)) {
        max-width: fit-content;
        padding: 0.5rem 1rem;
        min-width: min(100%, 71ch);
        margin: 1rem auto;
        box-shadow: 0 0 2rem 10px rgb(3 4 5 / 15%);
    }

    :global(._markdown .markdown-body) {
        display: flex;
        flex-direction: column;
        gap: var(--gap, 1rem);
    }

    :global(._markdown p) {
        opacity: 0.95;
    }

    :global(._markdown table) {
        border-collapse: collapse;
        overflow-x: auto;
        display: block;
        margin: 0.5rem auto;
        font-family: "Fira Code", monospace;
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
        min-height: 20.8rem;
        margin: 1.5rem auto;
        background-color: var(--secondary);
        box-shadow: 0 0 2rem 10px rgba(0, 0, 0, 0.2);
    }
    :global(.code-playground:first-child) {
        margin: 0 auto;
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
