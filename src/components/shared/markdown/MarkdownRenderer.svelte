<script lang="ts" module>
    import type { Plugin } from 'carta-md'
    import { Carta } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import rehypeExternalLinks from 'rehype-external-links'
    import '@cartamd/plugin-code/default.css'
    import { code } from '@cartamd/plugin-code'
    import type { Element, Parent, Root } from 'hast'
    import { visit } from 'unist-util-visit'
    import type { AvailableLanguages, Testcase } from '$lib/Project.svelte'
    import lzstring from 'lz-string'
    let isDark = $derived(ThemeStore.isColorDark(ThemeStore.theme.background.color))

    let theme = $derived(isDark ? ('one-dark-pro' as const) : ('one-light' as const))


    type Settings = {
        showMemory: boolean
        language: AvailableLanguages
        showConsole: boolean
        showTests: boolean
    }


    function createCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        const showMemory = settings.showMemory ? 'showMemory=true&' : ''
        const showConsole = settings.showConsole ? 'showConsole=true&' : ''
        const showTests = settings.showTests ? 'showTests=true&' : 'showTests=false&'
        const lang = `language=${settings.language}&`
        const compressed = lzstring.compressToEncodedURIComponent(code)
        const tests =
            testcases.length > 0
                ? `testcases=${lzstring.compressToEncodedURIComponent(JSON.stringify(testcases))}&`
                : ''
        return `/embed?${showMemory}${showTests}${showConsole}${lang}${tests}code=${compressed}`
    }

    const rehypePlaygroundTransformer = () => (tree: Root) => {
        visit(tree, 'element', (node: Element, index?: number, parent?: Parent) => {
            if (node.tagName === 'pre') {
                const codeNode = node.children?.find(
                    (child): child is Element => child.type === 'element' && child.tagName === 'code'
                )

                if (codeNode?.properties && Array.isArray(codeNode.properties.className)) {
                    const langClass = codeNode.properties.className.find(
                        (cls): cls is string => typeof cls === 'string' && cls.startsWith('language-')
                    )

                    if (langClass) {
                        const fullLanguage = langClass.substring('language-'.length)
												const entries = fullLanguage.split('|')
												const isPlayground = entries.includes('playground')
												const showMemory = entries.includes('memory')
												const showConsole = entries.includes('console')
												const showTests = entries.includes('tests')
                        if (isPlayground) {
                            const actualLanguage = entries[0]

                            const getAllText = (n: import('hast').Node | import('hast').Parent): string => {
                                if (n.type === 'text') return n.value as string
                                if ('children' in n && Array.isArray(n.children)) {
                                    return (n.children as Array<import('hast').Node | import('hast').Parent>).map(getAllText).join('')
                                }
                                return ''
                            }

                            if (parent && typeof index === 'number' && parent.children) {
                                // Replace the <pre> node with our placeholder <div>
                                const placeholder: Element = {
                                    type: 'element',
                                    tagName: 'iframe',
                                    properties: {
                                        className: 'code-playground',
                                        src: createCodeUrl(getAllText(codeNode), {
                                            showMemory,
																						showConsole,
																						showTests,
																						language: actualLanguage.toUpperCase()
                                        }, []),
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
                    processor.use(rehypeRaw)
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
                    processor.use(rehypeExternalLinks, {
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
        extensions: [
            ext,
						customPlaygroundPlugin,
						code({ theme, langs: ['mips', 'riscv', 'asm'] })
				],
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
    import { ThemeStore } from '$stores/themeStore.svelte'

    interface Props {
        source: string
        linksInNewTab?: boolean
        style?: string
    }

    let { source, linksInNewTab, style }: Props = $props()

    const carta = linksInNewTab ? cartaWithExternalLins : cartaNormal
</script>

<div class="_markdown" {style}>
	{#key source + theme}
		<Markdown value={source} {carta} />
	{/key}
</div>

<style lang="scss">
  ._markdown {
    display: flex;
    flex-direction: column;
		line-height: 1.4;
  }

  :global(.shiki) {
    padding: 0.5rem;
    overflow-x: auto;
    border-radius: 0.3rem;
    width: 100%;
  }
	:global(._markdown .markdown-body){
    display: flex;
    flex-direction: column;
		gap: 1rem;
	}
  :global(._markdown p){
		opacity: 0.9;
  }

  :global(._markdown table) {
    border-radius: 0.4rem;
    border-collapse: collapse;
    border-style: hidden;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  :global(._markdown table:last-child) {
    margin-bottom: 0;
  }

  :global(._markdown thead) {
    background-color: var(--accent2);
    color: var(--accent2-text);
  }

  :global(._markdown thead th) {
    padding: 0.4rem;
    border: 0.1rem solid var(--secondary);
  }

  :global(._markdown tbody) {
    background-color: var(--tertiary);
  }

  :global(._markdown td) {
    border: 0.1rem solid var(--secondary);
    padding: 0.2rem 0.4rem;
  }

  :global(._markdown ul, ._markdown ol) {
    padding-left: 1rem;
  }

  :global(._markdown li:not(:last-child)) {
    margin-bottom: 0.5rem;
  }

  :global(._markdown p) {
    white-space: pre-line;
  }
	:global(.code-playground){
    border: none;
    border-radius: 0.8rem;
    width: 100%;
    min-height: 20.4rem;
		background-color: var(--secondary);
	}
</style>
