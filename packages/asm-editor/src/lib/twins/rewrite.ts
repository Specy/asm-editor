import type { Nodes, Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import {
    isTestcaseFence,
    parsePlaygroundFence,
    type PlaygroundFence
} from '#lib/content/playgrounds.ts'
import { languageLabel } from '#lib/languages/languageLabel.ts'

/**
 * The one rewrite every **Markdown twin** goes through
 * ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)):
 * it changes how its source is written down, never its words. A code fence keeps its language and
 * its meaningful flags become a line before it, the flags that only set up a **Playground** are
 * dropped, and every link and image goes where `link` sends it. The text is edited where the parser
 * found each node rather than printed again from the tree, so nothing else in it moves.
 */

const parser = unified().use(remarkParse).use(remarkGfm)

/** Where a link of the source goes in the twin, given its URL as written. */
export type LinkRewriter = (url: string) => string

type Edit = { start: number; end: number; text: string }

/** What a Playground's flags say to a reader, the ones that are not about its panels. */
function playgroundLabel(fence: PlaygroundFence): string | undefined {
    const parts: string[] = []
    if (fence.isExercise)
        parts.push('Exercise: the code to start from, checked by the testcase after it')
    if (fence.isSolution) parts.push('Solution')
    if (fence.file) {
        const compiled = fence.sourceLanguage
            ? ` compiled for ${languageLabel(fence.settings.language)}`
            : ''
        parts.push(`File \`${fence.file}\`${compiled}`)
    }
    return parts.length ? `${parts.join(', ')}:` : undefined
}

/** The fence's new info string and the line put before it, for a fence whose info has flags. */
function fenceRewrite(info: string): { info: string; label?: string } | undefined {
    if (isTestcaseFence(info))
        return { info: 'json', label: 'Testcase for the program above (JSON):' }
    if (!info.includes('|')) return undefined
    const language = info.split('|')[0].trim()
    let fence: PlaygroundFence | undefined
    try {
        fence = parsePlaygroundFence(info)
    } catch {
        fence = undefined
    }
    return { info: language, label: fence ? playgroundLabel(fence) : undefined }
}

function codeEdits(source: string, node: Extract<Nodes, { type: 'code' }>): Edit[] {
    const start = node.position?.start.offset
    if (start === undefined) return []
    const info = [node.lang, node.meta].filter(Boolean).join(' ')
    const rewrite = fenceRewrite(info)
    if (!rewrite) return []
    const lineEnd = source.indexOf('\n', start)
    const firstLine = source.slice(start, lineEnd === -1 ? source.length : lineEnd)
    const fence = /^(`{3,}|~{3,})/.exec(firstLine)
    if (!fence) return []
    const lineStart = source.lastIndexOf('\n', start - 1) + 1
    const indent = source.slice(lineStart, start)
    const edits: Edit[] = []
    // A fence opened after a list marker or a quote's `>` keeps its label in the info string,
    // where a line of its own would leave the list or the quote.
    const ownLine = rewrite.label !== undefined && /^[ \t]*$/.test(indent)
    if (ownLine)
        edits.push({ start: lineStart, end: lineStart, text: `${indent}*${rewrite.label}*\n\n` })
    const infoText =
        rewrite.label !== undefined && !ownLine ? `${rewrite.info} ${rewrite.label}` : rewrite.info
    edits.push({
        start: start + fence[0].length,
        end: start + firstLine.length,
        text: infoText
    })
    return edits
}

/** The span of `url` in the source of a link, image or definition, after its text. */
function urlEdit(source: string, node: Nodes & { url: string }, rewrite: LinkRewriter): Edit[] {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined || !node.url) return []
    const next = rewrite(node.url)
    if (next === node.url) return []
    const written = source.slice(start, end)
    // the destination follows the text (`](`) of a link or image and the label (`]:`) of a
    // definition; an autolink is nothing but the URL
    const after = Math.max(written.lastIndexOf(']('), written.lastIndexOf(']:'), 0)
    const at = written.indexOf(node.url, after)
    if (at === -1) return []
    return [{ start: start + at, end: start + at + node.url.length, text: next }]
}

/** The `href` and `src` attributes of raw HTML, which a Lecture's `<details>` or a figure has. */
function htmlEdits(node: Extract<Nodes, { type: 'html' }>, rewrite: LinkRewriter): Edit[] {
    const start = node.position?.start.offset
    if (start === undefined) return []
    const edits: Edit[] = []
    for (const match of node.value.matchAll(/\b(?:href|src)=(["'])(.*?)\1/g)) {
        const url = match[2]
        const next = rewrite(url)
        if (next === url) continue
        const at = start + match.index + match[0].indexOf(url, match[0].indexOf('=') + 2)
        edits.push({ start: at, end: at + url.length, text: next })
    }
    return edits
}

export function rewriteMarkdown(source: string, link: LinkRewriter): string {
    const tree = parser.parse(source) as Root
    const edits: Edit[] = []
    visit(tree, (node: Nodes) => {
        if (node.type === 'code') edits.push(...codeEdits(source, node))
        else if (node.type === 'link' || node.type === 'image' || node.type === 'definition')
            edits.push(...urlEdit(source, node, link))
        else if (node.type === 'html') edits.push(...htmlEdits(node, link))
    })
    edits.sort((a, b) => b.start - a.start || b.end - a.end)
    let out = source
    for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
    return out
}
