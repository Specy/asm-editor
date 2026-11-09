import type { Element, Parent, Root } from 'hast'
import { toString as hastToString } from 'hast-util-to-string'
import DOMPurify from 'isomorphic-dompurify'
import rehypeExternalLinks from 'rehype-external-links'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { rehypeCodeBlocks } from './codeBlocks'
import { HeadingSlugger } from './headings'
import { rehypePlainPlaygrounds, rehypePlaygrounds } from './markdownPlaygrounds'
import { responsiveImage } from '#lib/images/responsive.ts'

/**
 * Markdown to HTML, for every Markdown text the app shows: one synchronous pipeline that the server
 * render and the browser run alike, so what a prerendered page carries is what its reader keeps
 * ([ADR 0053](../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
 * The output depends on the source and the options alone, never on the theme, the window or the
 * time: Svelte keeps the server's HTML while hydrating and would otherwise show a page the browser
 * did not compute.
 */
export type MarkdownOptions = {
    /**
     * What a link does: open in the same tab, in a new one, or nothing at all, for an Exam. With
     * links disabled, a link into the Documentation stays as a mark the Documentation panel follows.
     */
    links?: 'same-tab' | 'new-tab' | 'disabled'
    /** Give the h2 and h3 headings the slugs a Lecture's search results open it at. */
    headingIds?: boolean
    /** Playgrounds marked for their embed, or shown as plain code. */
    playgrounds?: 'embed' | 'code'
    /**
     * Markdown a Project File holds, which whoever shared the Project wrote: none of its own styles,
     * frames or forms.
     */
    untrusted?: boolean
}

/**
 * Gives every second- and third-level heading its id, the slug that the search index links a
 * **Lecture section** to ([headings.ts](./headings.ts)). In the render itself, so the ids are in
 * the prerendered page: SvelteKit fails the prerender on a `#` link with no target.
 */
const rehypeHeadingIds = () => (tree: Root) => {
    const slugger = new HeadingSlugger()
    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'h2' && node.tagName !== 'h3') return
        node.properties = { ...node.properties, id: slugger.slug(hastToString(node)) }
    })
}

/**
 * Takes every link out and keeps its text. A link into the Documentation is kept as a mark
 * instead (`span.doc-link`), which the Documentation panel follows to another of its own
 * entries: that never leaves the page, so it is allowed where every other link is not, in an
 * Exam. Anywhere else the mark reads as the plain text it replaced.
 */
const rehypeDisableLinks = () => (tree: Root) => {
    visit(tree, 'element', (node: Element, index?: number, parent?: Parent) => {
        if (node.tagName !== 'a' || typeof index !== 'number' || !parent) return
        const href = node.properties?.href
        if (typeof href === 'string' && href.startsWith('/documentation/')) {
            parent.children.splice(index, 1, {
                type: 'element',
                tagName: 'span',
                properties: { className: ['doc-link'], 'data-doc-href': href },
                children: node.children
            })
            return
        }
        parent.children.splice(index, 1, ...node.children)
    })
}

/**
 * Takes every `style` attribute off a Project File's Markdown: one written into it could restyle
 * or cover the page around the preview.
 */
const rehypeStripStyles = () => (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
        delete node.properties.style
    })
}

/** What a Project File's Markdown may not bring: stylesheets, frames, plugins and forms. */
const UNTRUSTED_FORBIDDEN_TAGS = [
    'style',
    'iframe',
    'frame',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'select',
    'textarea'
]

/**
 * A picture in the text, drawn at most the text column's width (about 720 pixels: 38em of the
 * reading size, or 70ch on a blog post), and the whole screen's on a phone.
 */
const TEXT_IMAGE_SIZES = '(max-width: 760px) 100vw, 720px'

/**
 * Lets the browser load a smaller copy of a static picture the build made one of
 * ([responsive.ts](../images/responsive.ts)): a blog post's screenshots are 1440 to 1800 pixels
 * wide and drawn 370 on a phone. Pictures without copies are left as they are.
 */
const rehypeResponsiveImages = () => (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
        const src = node.properties.src
        if (node.tagName !== 'img' || typeof src !== 'string' || node.properties.srcSet) return
        const { srcset } = responsiveImage(src)
        if (!srcset) return
        node.properties.srcSet = srcset
        node.properties.sizes = TEXT_IMAGE_SIZES
    })
}

function sanitize(html: string, options: Required<MarkdownOptions>): string {
    if (options.untrusted)
        return DOMPurify.sanitize(html, { FORBID_TAGS: UNTRUSTED_FORBIDDEN_TAGS })
    return DOMPurify.sanitize(html, {
        ADD_TAGS: ['iframe'],
        ...(options.links === 'disabled' ? { FORBID_TAGS: ['a'] } : {})
    })
}

/** The options as the pipeline applies them: a Project File's Markdown never embeds or links in place. */
function resolved(options: MarkdownOptions): Required<MarkdownOptions> {
    const untrusted = options.untrusted ?? false
    return {
        links: options.links ?? (untrusted ? 'new-tab' : 'same-tab'),
        headingIds: options.headingIds ?? false,
        playgrounds: untrusted ? 'code' : (options.playgrounds ?? 'embed'),
        untrusted
    }
}

function createProcessor(options: Required<MarkdownOptions>) {
    //`use` adds to the processor it is called on, so the steps an option asks for go on in order
    const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeRaw)
    if (options.links === 'new-tab') processor.use(rehypeExternalLinks, { target: '_blank' })
    if (options.links === 'disabled') processor.use(rehypeDisableLinks)
    if (options.untrusted) processor.use(rehypeStripStyles)
    if (options.headingIds) processor.use(rehypeHeadingIds)
    if (!options.untrusted) processor.use(rehypeResponsiveImages)
    processor.use(options.playgrounds === 'code' ? rehypePlainPlaygrounds : rehypePlaygrounds)
    processor.use(rehypeCodeBlocks)
    return processor.use(rehypeStringify)
}

/** One processor per set of options, built the first time it is asked for. */
const processors = new Map<string, ReturnType<typeof createProcessor>>()

/** A Markdown text as sanitized HTML. */
export function renderMarkdown(source: string, options: MarkdownOptions = {}): string {
    const applied = resolved(options)
    const key = JSON.stringify(applied)
    let processor = processors.get(key)
    if (!processor) {
        processor = createProcessor(applied)
        processors.set(key, processor)
    }
    return sanitize(String(processor.processSync(source)), applied)
}
