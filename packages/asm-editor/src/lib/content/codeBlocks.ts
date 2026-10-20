import type { Element, ElementContent, Root } from 'hast'
import { toString } from 'hast-util-to-string'
import { visit } from 'unist-util-visit'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { tokenizeAssembly } from './assemblyHighlight'
import { assemblyTokenClass, cppTokenClass } from './assemblyPalette'
import { tokenizeCpp } from './cppHighlight'
import { fenceLanguage } from './fenceLanguage'

/** A terminal newline ends the last line rather than adding a line-number-only row. */
export function codeLineNumbers(source: string): string {
    const count = Math.max(1, source.replace(/\n$/, '').split('\n').length)
    return Array.from({ length: count }, (_, index) => String(index + 1)).join('\n')
}

/** Lines of classed tokens as the children of a `<code>`, a span per coloured token. */
function tokenChildren<T extends { text: string }>(
    lines: T[][],
    classOf: (token: T) => string | undefined
): ElementContent[] {
    const children: ElementContent[] = []
    lines.forEach((tokens, index) => {
        if (index > 0) children.push({ type: 'text', value: '\n' })
        for (const token of tokens) {
            const className = classOf(token)
            children.push(
                className
                    ? {
                          type: 'element',
                          tagName: 'span',
                          properties: { className: [className] },
                          children: [{ type: 'text', value: token.text }]
                      }
                    : { type: 'text', value: token.text }
            )
        }
    })
    return children
}

export function highlightedAssemblyCode(
    source: string,
    language: AvailableLanguages
): ElementContent[] {
    return tokenChildren(tokenizeAssembly(source, language), (token) =>
        assemblyTokenClass(token, language)
    )
}

/** C or C++, coloured as the editor colours a `.c` or `.cpp` File. */
export function highlightedCppCode(source: string): ElementContent[] {
    return tokenChildren(tokenizeCpp(source), cppTokenClass)
}

function classes(node: Element): string[] {
    const value = node.properties.className ?? node.properties.class
    return Array.isArray(value)
        ? value.map(String)
        : typeof value === 'string'
          ? value.split(/\s+/)
          : []
}

/**
 * Colours each code block with the editor's own highlighters and adds its line numbers, without
 * putting them inside the code or the embed payload. Assembly and C/C++ are coloured here; a block
 * in any other language keeps its `language-` class, for Monaco to colour where the host asks for
 * it, and stays plain everywhere else.
 */
function decorateCodeBlocks(tree: Root): void {
    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'pre') return
        const code = node.children.find(
            (child): child is Element => child.type === 'element' && child.tagName === 'code'
        )
        if (!code) return

        const names = new Set(classes(node))
        const languageName = classes(code).find((name) => name.startsWith('language-'))
        // Playground marking owns its block's language class and the source the embed is built from.
        if (languageName && typeof node.properties['data-playground'] !== 'string') {
            const language = fenceLanguage(languageName.slice('language-'.length))
            const source = toString(code).replace(/\n$/, '')
            if (language.kind === 'assembly' || language.kind === 'c-cpp') {
                code.children =
                    language.kind === 'assembly'
                        ? highlightedAssemblyCode(source, language.language)
                        : highlightedCppCode(source)
                code.properties = { className: ['asm-code'] }
                names.add('asm-block')
            }
        }
        names.add('code-block')
        if (typeof node.properties['data-playground'] === 'string') {
            names.add('code-gutter-spacing')
        }
        node.properties = { ...node.properties, className: [...names] }
        node.children = node.children.filter(
            (child) => child.type !== 'element' || !classes(child).includes('code-gutter')
        )
        // CSS places the gutter before the code.
        node.children.push({
            type: 'element',
            tagName: 'span',
            properties: { className: ['code-gutter'], ariaHidden: 'true' },
            children: [{ type: 'text', value: codeLineNumbers(toString(code)) }]
        })
    })
}

/** The rehype plugin of the [Markdown pipeline](./markdown.ts) that decorates code blocks. */
export const rehypeCodeBlocks = () => decorateCodeBlocks
