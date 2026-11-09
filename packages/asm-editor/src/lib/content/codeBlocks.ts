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
            code.children.push(indentGuides(toString(code)))
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

/** Monaco's tab and indent size, which the editors leave at its default. */
const EDITOR_TAB_SIZE = 4

/** How far a line is indented in columns, or -1 for a blank one: Monaco's `computeIndentLevel`. */
function indentOf(line: string): number {
    let indent = 0
    for (const char of line) {
        if (char === ' ') indent++
        else if (char === '\t') indent = indent - (indent % EDITOR_TAB_SIZE) + EDITOR_TAB_SIZE
        else return indent
    }
    return -1
}

/**
 * How many indentation guides Monaco draws on each line of a text: one per level an indented line
 * reaches, and for a blank line the level of the lines around it, by Monaco's own rule
 * (`getLinesIndentGuides` in its guidesTextModelPart.js, without the off-side rule no assembly
 * language has).
 */
export function indentGuideLevels(source: string): number[] {
    const indents = source.split('\n').map(indentOf)
    const content = (from: number, step: 1 | -1) => {
        for (let index = from; index >= 0 && index < indents.length; index += step) {
            if (indents[index] >= 0) return indents[index]
        }
        return -1
    }
    return indents.map((indent, index) => {
        if (indent >= 0) return Math.ceil(indent / EDITOR_TAB_SIZE)
        const above = content(index - 1, -1)
        const below = content(index + 1, 1)
        if (above === -1 || below === -1) return 0
        if (above < below) return 1 + Math.floor(above / EDITOR_TAB_SIZE)
        if (above === below) return Math.ceil(below / EDITOR_TAB_SIZE)
        return 1 + Math.floor(below / EDITOR_TAB_SIZE)
    })
}

/**
 * The indentation guides of a playground's code block, which stands in for the editor until it
 * loads: one mark per run of lines at each level, the 1px line Monaco draws there, placed by CSS
 * (codeBlocks.css) from the line it starts on, how many lines it runs and its level. Empty, so the
 * code's text, which the embed is built from, is unchanged.
 */
function indentGuides(source: string): Element {
    const levels = indentGuideLevels(source)
    const marks: Element[] = []
    const deepest = Math.max(0, ...levels)
    for (let level = 1; level <= deepest; level++) {
        let start = -1
        for (let line = 0; line <= levels.length; line++) {
            const inside = line < levels.length && levels[line] >= level
            if (inside && start < 0) start = line
            if (!inside && start >= 0) {
                marks.push({
                    type: 'element',
                    tagName: 'i',
                    properties: {
                        style: `--from: ${start}; --lines: ${line - start}; --level: ${level - 1}`
                    },
                    children: []
                })
                start = -1
            }
        }
    }
    return {
        type: 'element',
        tagName: 'span',
        properties: { className: ['code-indent-guides'], ariaHidden: 'true' },
        children: marks
    }
}

/** The rehype plugin of the [Markdown pipeline](./markdown.ts) that decorates code blocks. */
export const rehypeCodeBlocks = () => decorateCodeBlocks
