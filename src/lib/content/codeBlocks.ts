import type { Plugin } from 'carta-md'
import type { Element, ElementContent, Root } from 'hast'
import { toString } from 'hast-util-to-string'
import { visit } from 'unist-util-visit'
import type { AvailableLanguages } from '$lib/Project.svelte'
import { tokenizeAssembly } from './assemblyHighlight'
import { parsePlaygroundLanguage } from './playgrounds'

/** A terminal newline ends the last line rather than adding a line-number-only row. */
export function codeLineNumbers(source: string): string {
    const count = Math.max(1, source.replace(/\n$/, '').split('\n').length)
    return Array.from({ length: count }, (_, index) => String(index + 1)).join('\n')
}

export function highlightedAssemblyCode(
    source: string,
    language: AvailableLanguages
): ElementContent[] {
    const children: ElementContent[] = []
    tokenizeAssembly(source, language).forEach((tokens, index) => {
        if (index > 0) children.push({ type: 'text', value: '\n' })
        for (const token of tokens) {
            children.push(
                token.kind === 'plain'
                    ? { type: 'text', value: token.text }
                    : {
                          type: 'element',
                          tagName: 'span',
                          properties: { className: [`asm-${token.kind}`] },
                          children: [{ type: 'text', value: token.text }]
                      }
            )
        }
    })
    return children
}

function classes(node: Element): string[] {
    // Shiki emits `class`; remark/rehype emit `className`.
    const value = node.properties.className ?? node.properties.class
    return Array.isArray(value)
        ? value.map(String)
        : typeof value === 'string'
          ? value.split(/\s+/)
          : []
}

/** Decorate source without putting the line numbers inside the code or the embed payload. */
function decorateCodeBlocks(tree: Root): void {
    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'pre') return
        const code = node.children.find(
            (child): child is Element => child.type === 'element' && child.tagName === 'code'
        )
        if (!code) return

        const names = new Set(classes(node))
        const languageName = classes(code).find((name) => name.startsWith('language-'))
        const language =
            languageName && parsePlaygroundLanguage(languageName.slice(9).split('|')[0])
        // Playground marking owns its language class and source-to-iframe handoff.
        if (language && typeof node.properties['data-playground'] !== 'string') {
            code.children = highlightedAssemblyCode(toString(code).replace(/\n$/, ''), language)
            delete code.properties.class
            code.properties = { ...code.properties, className: ['asm-code'] }
            names.add('asm-block')
        }
        names.add('code-block')
        if (typeof node.properties['data-playground'] === 'string') {
            names.add('code-gutter-spacing')
        }
        // Serializing both names produces duplicate class attributes; HTML keeps only the first.
        delete node.properties.class
        node.properties = { ...node.properties, className: [...names] }
        node.children = node.children.filter(
            (child) => child.type !== 'element' || !classes(child).includes('code-gutter')
        )
        // Keep code first: Shiki's pre handler expects it there. CSS places the gutter first.
        node.children.push({
            type: 'element',
            tagName: 'span',
            properties: { className: ['code-gutter'], ariaHidden: 'true' },
            children: [{ type: 'text', value: codeLineNumbers(toString(code)) }]
        })
    })
}

/** Add after Carta's code plugin so its async pass also decorates Shiki's replacement blocks. */
export function codeBlocks(): Plugin {
    return {
        transformers: [
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(() => decorateCodeBlocks)
                }
            },
            {
                execution: 'async',
                type: 'rehype',
                transform({ processor }) {
                    // A distinct attacher runs after Shiki even though the sync pass runs first.
                    processor.use(() => decorateCodeBlocks)
                }
            }
        ]
    }
}
