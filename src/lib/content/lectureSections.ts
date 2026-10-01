import type { Nodes, Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { HeadingSlugger } from './headings'
import { isTestcaseFence, parsePlaygroundLanguage } from './playgrounds'

/**
 * A Lecture's **Lecture sections** ([CONTEXT.md](../../../CONTEXT.md)): the part under each
 * second-level heading, third-level headings folded in, and the opening text before the first one.
 * The search index finds and links these, so the split has to read markdown the way the renderer
 * does: remark, not lines. A `#` inside a code fence is not a heading (MIPS and RISC-V comments
 * start with one), and a fence indented inside a list item is still a fence.
 */

export type LectureSection = {
    /** The heading's id on the page ([headings.ts](./headings.ts)); empty for the opening text. */
    slug: string
    /** The heading's text; `null` for the opening text. */
    title: string | null
    /** The text a reader reads, inline code kept, code blocks and exercise solutions left out. */
    prose: string
    /** The section's code blocks (playgrounds and plain fences), testcase fences left out. */
    code: string
    /** The comments of that code, which say in words what it does. */
    comments: string
    /** The section's markdown without its heading, solutions included. */
    markdown: string
}

const parser = unified().use(remarkParse).use(remarkGfm)

type Draft = { slug: string; title: string | null; nodes: RootContent[] }

/** Text of a heading as the renderer sees it: inline code kept as its text. */
function plain(node: Nodes): string {
    if ('value' in node && (node.type === 'text' || node.type === 'inlineCode')) return node.value
    if ('children' in node) return (node.children as Nodes[]).map(plain).join('')
    return ''
}

/** The comment marker of a fence's language: `#` for MIPS and RISC-V, `;` everywhere else. */
function commentMarker(info: string): string {
    const language = parsePlaygroundLanguage(info.split(/[|\s]/)[0])
    return language === 'MIPS' || language === 'RISC-V' || language === 'RISC-V-64' ? '#' : ';'
}

function commentsOf(code: string, marker: string): string[] {
    const out: string[] = []
    for (const line of code.split('\n')) {
        const at = line.indexOf(marker)
        if (at < 0) continue
        const comment = line.slice(at + 1).trim()
        //`@screen` and its kind configure the editor; they say nothing about the program
        if (comment.startsWith('@')) continue
        if (/[\p{L}]{2,}/u.test(comment)) out.push(comment)
    }
    return out
}

const BLOCKS = new Set(['paragraph', 'heading', 'tableCell', 'listItem', 'blockquote', 'tableRow'])

class Collector {
    prose: string[] = []
    code: string[] = []
    comments: string[] = []
    /** Open `<details>` blocks: an Exercise's solution, which is not what the section says. */
    private details = 0

    add(node: Nodes) {
        if (node.type === 'html') {
            const opens = (node.value.match(/<details[\s>]/g) ?? []).length
            const closes = (node.value.match(/<\/details>/g) ?? []).length
            this.details = Math.max(0, this.details + opens - closes)
            return
        }
        if (this.details > 0) return
        if (node.type === 'code') {
            const info = `${node.lang ?? ''}${node.meta ? ` ${node.meta}` : ''}`
            if (isTestcaseFence(info)) return
            this.code.push(node.value)
            this.comments.push(...commentsOf(node.value, commentMarker(info)))
            return
        }
        if (node.type === 'text' || node.type === 'inlineCode') {
            this.prose.push(node.value)
            return
        }
        if (node.type === 'image') {
            this.prose.push(node.alt ?? '')
            return
        }
        if (node.type === 'break') {
            this.prose.push('\n')
            return
        }
        if ('children' in node) {
            for (const child of node.children as Nodes[]) this.add(child)
            if (BLOCKS.has(node.type)) this.prose.push('\n')
        }
    }
}

function tidy(text: string): string {
    return text
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
}

export function splitLecture(source: string): LectureSection[] {
    const tree = parser.parse(source) as Root
    const slugger = new HeadingSlugger()
    const drafts: Draft[] = [{ slug: '', title: null, nodes: [] }]
    tree.children.forEach((node, index) => {
        //a Lecture that repeats its title as a `# Title` repeats what the page already shows
        if (index === 0 && node.type === 'heading' && node.depth === 1) return
        if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) {
            const text = plain(node)
            const slug = slugger.slug(text)
            if (node.depth === 2) {
                drafts.push({ slug, title: text.trim(), nodes: [] })
                return
            }
        }
        drafts[drafts.length - 1].nodes.push(node)
    })

    const sections: LectureSection[] = []
    for (const draft of drafts) {
        const collector = new Collector()
        for (const node of draft.nodes) collector.add(node)
        const first = draft.nodes[0]?.position?.start.offset
        const last = draft.nodes[draft.nodes.length - 1]?.position?.end.offset
        const section: LectureSection = {
            slug: draft.slug,
            title: draft.title,
            prose: tidy(collector.prose.join('')),
            code: collector.code.join('\n\n'),
            comments: collector.comments.join('\n'),
            markdown:
                first === undefined || last === undefined ? '' : source.slice(first, last).trim()
        }
        //an opening with nothing in it is no section; a heading always is one
        if (section.title === null && !section.prose && !section.code) continue
        sections.push(section)
    }
    return sections
}
