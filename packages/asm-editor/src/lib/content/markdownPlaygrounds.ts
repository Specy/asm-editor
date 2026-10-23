import type { Element, Parent, Root, RootContent } from 'hast'
import lzstring from 'lz-string'
import { visit } from 'unist-util-visit'
import type { Testcase } from '#lib/Project.svelte.ts'
import { serializer } from '#lib/json.ts'
import {
    isTestcaseFence,
    namedPlaygroundProgram,
    parsePlaygroundFence,
    parseTestcaseFence,
    playgroundFileName,
    type PlaygroundFence,
    type PlaygroundSettings
} from './playgrounds'
import { encodePlaygroundProgram, type PlaygroundProgram } from './playgroundProgram'
import { highlightedAssemblyCode } from './codeBlocks'

/**
 * The **Playgrounds** of a rendered Markdown text ([the pipeline](./markdown.ts)). The render
 * leaves each one a code block marked with what its embed needs, which is all a prerendered page
 * carries; the renderer swaps the embed in once it is mounted, from those marks
 * ([ADR 0053](../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
 */

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
        const parsed = parseTestcaseFence(raw)
        return parsed.hasTestcase ? [parsed.testcase] : []
    } catch (e) {
        const where = typeof window === 'undefined' ? '' : ` on ${window.location.pathname}`
        console.error(
            `Malformed testcase fence${where}, after the "${info}" playground: ${(e as Error).message}\n${raw}`
        )
        return []
    }
}

/**
 * The box a playground occupies, which the code block the render leaves and the iframe that
 * replaces it on mount share: the swap has to move nothing around it. `details` is a collapsed
 * block (an Exercise's solution), which is itself the centered column and the frame, so a
 * playground inside one fills it instead of placing itself, and a large one widens the block.
 */
function playgroundBox(fence: PlaygroundFence, parent: Parent) {
    const details =
        parent.type === 'element' && (parent as Element).tagName === 'details'
            ? (parent as Element)
            : undefined
    if (details && fence.large) {
        const className = details.properties?.className
        details.properties = {
            ...details.properties,
            className: [...(Array.isArray(className) ? className : []), 'wide']
        }
    }
    const placement =
        details || fence.large
            ? ''
            : 'max-width: 70ch; margin: 1.5rem var(--md-inline-margin, auto);'
    const screenHeight = fence.settings.showScreen ? 'min(40rem, 85vh)' : undefined
    //a playground's Screen waits for a Build (see `embedQuery`), so there is nothing to make room
    //for until then: the frame starts at the stylesheet's height and the renderer grows it once the
    //embed says it is built. A `tall` fence asked for its height whatever it shows
    const grows = !fence.tall && screenHeight !== undefined
    const height = fence.tall
        ? 'height: 80dvh;'
        : screenHeight && !grows
          ? `height: ${screenHeight};`
          : ''
    return {
        className: details ? ['code-playground', 'in-details'] : ['code-playground'],
        //a fence that asks for no height of its own leaves it to the stylesheet, which gives the
        //code block the same one as the iframe's min-height
        style: `${placement} ${height}`.trim(),
        ...(grows ? { 'data-built-height': screenHeight } : undefined)
    }
}

/**
 * Marks a playground fence as one, in place, leaving it an ordinary code block. This is the
 * whole of what a prerendered page carries: the iframe is built from these marks in the browser,
 * once the page is mounted. A lecture's playgrounds are its worked examples, so a page that
 * shipped only its prose was hiding the code it was written about from anything that does not
 * run scripts, and every `/embed?code=...` in the static HTML was another URL for a crawler to
 * find and discard against the canonical.
 *
 * The settings and testcases travel on the element rather than being re-derived later, because
 * the fence info string is the one thing the rendered page cannot give back: the class it leaves
 * behind names the language alone. DOMPurify keeps `data-*` attributes by default.
 */
function markPlayground(
    node: Element,
    fence: PlaygroundFence,
    info: string,
    testcases: Testcase[],
    parent: Parent
): Element {
    const codeNode = node.children?.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code'
    )
    if (codeNode) {
        //`language-m68k|playground|memory` is not a language; the fence's first entry is
        codeNode.properties = {
            ...codeNode.properties,
            className: [`language-${info.split('|')[0].trim().toLowerCase()}`]
        }
        //the trailing newline a fence leaves behind would render as an empty last line, and the
        //embed URL is built from these same children, so both are trimmed once, here
        const text = textOf(codeNode).trimEnd()
        codeNode.children = fence.sourceLanguage
            ? [{ type: 'text', value: text }]
            : highlightedAssemblyCode(text, fence.settings.language)
    }
    node.properties = {
        ...node.properties,
        ...playgroundBox(fence, parent),
        'data-playground': info,
        ...(testcases.length > 0
            ? { 'data-testcases': serializer.stringify(testcases) }
            : undefined)
    }
    return node
}

/**
 * Marks every playground fence and drops the `testcase` fences, which are instructions to the
 * embed and to the verification test and are never shown to a reader. The children of a block
 * are rebuilt rather than patched in place, so a testcase and the blank line before it leave
 * together.
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
            const fileNodes = [
                { node, info: info as string, code: textOf(node).replace(/\n$/, '') }
            ]
            if (fence.file) {
                for (;;) {
                    const next = nextBlock(children, index)
                    const nextInfo = next && fenceInfoOf(next.node)
                    if (
                        !next ||
                        nextInfo === undefined ||
                        !playgroundFileName(nextInfo) ||
                        parsePlaygroundFence(nextInfo) ||
                        next.node.type !== 'element'
                    )
                        break
                    fileNodes.push({
                        node: next.node,
                        info: nextInfo,
                        code: textOf(next.node).replace(/\n$/, '')
                    })
                    index = next.index
                }
            }
            const following = nextBlock(children, index)
            const followingInfo = following && fenceInfoOf(following.node)
            if (following && followingInfo !== undefined && isTestcaseFence(followingInfo)) {
                testcases = attachedTestcases(following.node, info as string)
                //the testcase block and the whitespace before it go with the playground
                index = following.index
            }
            const marked = markPlayground(node, fence, info as string, testcases, parent)
            if (fence.file) {
                const program = namedPlaygroundProgram(fence, fileNodes)
                const properties = marked.properties
                //Keep each source visible with its filename in the prerendered page. Only
                //the wrapper becomes an iframe, so all files share one emulator.
                marked.properties = { 'data-playground-file': true }
                result.push({
                    type: 'element',
                    tagName: 'div',
                    properties: { ...properties, 'data-program': JSON.stringify(program) },
                    children: fileNodes.flatMap(({ node: fileNode, info: fileInfo }) => {
                        const codeNode = fileNode.children.find(
                            (child): child is Element =>
                                child.type === 'element' && child.tagName === 'code'
                        )
                        if (codeNode)
                            codeNode.properties.className = [`language-${fileInfo.split('|')[0]}`]
                        return [
                            {
                                type: 'element' as const,
                                tagName: 'div',
                                properties: { className: ['playground-filename'] },
                                children: [
                                    {
                                        type: 'text' as const,
                                        value: playgroundFileName(fileInfo)!
                                    }
                                ]
                            },
                            fileNode
                        ]
                    })
                })
            } else result.push(marked)
            continue
        }
        //a testcase fence that attached to nothing is still not something a reader should read
        if (info !== undefined && isTestcaseFence(info)) continue
        if (node.type === 'element') transformPlaygrounds(node)
        result.push(node)
    }
    parent.children = result
}

/** Marks each playground for its embed, which the renderer swaps in once mounted. */
export const rehypePlaygrounds = () => (tree: Root) => {
    transformPlaygrounds(tree)
}

/**
 * Playgrounds as plain code, for a Lecture section read inside the Documentation panel, where an
 * embedded editor with an Emulator of its own does not belong. The marking highlights them and
 * drops their testcases; what makes them a playground's box is then taken off again.
 */
export const rehypePlainPlaygrounds = () => (tree: Root) => {
    transformPlaygrounds(tree)
    visit(tree, 'element', (node: Element) => {
        if (typeof node.properties?.['data-playground'] !== 'string') return
        node.properties = { className: ['plain-playground'] }
        for (const child of node.children) {
            if (child.type === 'element' && child.tagName === 'code') {
                child.properties = { className: ['asm-code'] }
            }
        }
    })
}

/** What a marked playground carries for its embed, read back from the rendered page. */
export type PlaygroundMarks = {
    /** The fence info string (`data-playground`). */
    info: string
    /** The source of a single-file playground, as its code block shows it. */
    code: string
    /** `data-testcases`, when the playground has a testcase fence. */
    testcases?: string
    /** `data-program`, when the playground is several named Files. */
    program?: string
}

/** The testcases a marked playground carries, if it carries any. */
function markedTestcases(raw: string | undefined): Testcase[] {
    if (raw === undefined) return []
    try {
        return serializer.parse<Testcase[]>(raw)
    } catch (e) {
        console.error(`Unreadable testcases on a playground: ${(e as Error).message}\n${raw}`)
        return []
    }
}

/**
 * The embed's settings for a fence. Every playground keeps its memory, registers, flags, PC and
 * Screen out of the way until its program is built, leaving the reader the whole width for the code
 * while it is edited; the console and the Testcases stay, so nothing under the code moves on Build.
 */
function embedQuery(settings: PlaygroundSettings): string {
    const showMemory = settings.showMemory ? 'showMemory=true&' : ''
    const showConsole = settings.showConsole ? 'showConsole=true&' : ''
    const showTests = settings.showTests ? 'showTests=true&' : 'showTests=false&'
    const showPc = settings.showPc ? 'showPc=true&' : ''
    const showRegisters = settings.showRegisters ? 'showRegisters=true&' : 'showRegisters=false&'
    const showFlags = settings.showFlags ? 'showFlags=true&' : 'showFlags=false&'
    const showScreen = settings.showScreen ? 'showScreen=true&' : ''
    const openScreen = settings.openScreen ? 'openScreen=true&' : ''
    const hideUntilBuilt = 'hideUntilBuilt=true&'
    const showOpenButton = settings.openButton ? 'openButton=true&' : ''
    const registerFile = settings.registerFile ? `registerFile=${settings.registerFile}&` : ''
    return [
        showMemory,
        showConsole,
        showTests,
        showPc,
        showRegisters,
        showFlags,
        showScreen,
        openScreen,
        hideUntilBuilt,
        showOpenButton,
        registerFile
    ].join('')
}

/** The address of a marked playground's embed, or none when its fence is not a playground's. */
export function playgroundEmbedUrl(marks: PlaygroundMarks): string | undefined {
    const fence = parsePlaygroundFence(marks.info)
    if (!fence) return undefined
    const settings = fence.settings
    const testcases = markedTestcases(marks.testcases)
    const program =
        marks.program === undefined ? undefined : (JSON.parse(marks.program) as PlaygroundProgram)
    const lang = `language=${settings.language}&`
    const tests =
        testcases.length > 0
            ? `testcases=${lzstring.compressToEncodedURIComponent(serializer.stringify(testcases))}&`
            : ''
    const source = program
        ? `program=${encodePlaygroundProgram(program)}`
        : `code=${lzstring.compressToEncodedURIComponent(marks.code)}`
    return `/embed?${lang}${embedQuery(settings)}${tests}${source}`
}
