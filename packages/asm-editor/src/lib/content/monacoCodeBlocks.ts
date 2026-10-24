import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { fenceLanguage } from './fenceLanguage'

/**
 * Colours the code blocks our own highlighters leave plain with Monaco, for the hosts that ask for
 * it: the Workbench's Markdown Preview and the Exam's pages, where Monaco is part of the page anyway
 * ([ADR 0053](../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
 * Browser only; Monaco is imported when a page first asks, so a page that never does never loads it.
 */

/** Names that colour nothing: plain text, and a Playground's testcases. */
const UNCOLOURED = new Set(['text', 'plaintext', 'txt', 'testcase'])

/**
 * Each block Monaco has coloured, by its fence's language name and its text, so a block that
 * renders again while the text around it is being typed keeps its colours. `null` is a language
 * Monaco does not have. Monaco's colouring names its colours by their place in the theme's own
 * table, so what was coloured under one theme is thrown away when the theme changes.
 */
const coloured = new Map<string, string | null>()
let colouredUnder: string | undefined

/** The languages whose tokenizer has been asked for, until it is there. */
const activated = new Map<string, Promise<void>>()

/** The blocks under `root` in a language of their own, with the name their fence gives. */
function blocksToColour(root: ParentNode) {
    const blocks: { code: HTMLElement; name: string; text: string }[] = []
    for (const code of root.querySelectorAll<HTMLElement>('pre.code-block > code')) {
        const languageClass = [...code.classList].find((name) => name.startsWith('language-'))
        if (!languageClass) continue
        const language = fenceLanguage(languageClass.slice('language-'.length))
        if (language.kind !== 'other' || UNCOLOURED.has(language.name)) continue
        //the newline a fence leaves behind would come back from Monaco as an empty last line
        const text = (code.textContent ?? '').replace(/\n$/, '')
        blocks.push({ code, name: language.name, text })
    }
    return blocks
}

/** The Monaco language a fence names, as Monaco names one: by id, alias or file extension. */
function monacoLanguageId(instance: MonacoType, name: string): string | undefined {
    for (const language of instance.languages.getLanguages()) {
        const names = [
            language.id,
            ...(language.aliases ?? []),
            ...(language.extensions ?? []).map((extension) => extension.replace(/^\./, ''))
        ]
        if (names.some((candidate) => candidate.toLowerCase() === name)) return language.id
    }
    return undefined
}

/**
 * Waits for a language's tokenizer. `colorize` does not: it paints plain what it has no tokenizer
 * for yet, and a language with a service of its own (JSON, CSS, HTML, TypeScript) registers its
 * tokenizer only once a model of it exists. A tokenizer that never comes is waited for once.
 */
function activate(instance: MonacoType, id: string): Promise<void> {
    let pending = activated.get(id)
    if (!pending) {
        pending = (async () => {
            instance.editor.createModel('', id).dispose()
            for (let attempt = 0; attempt < 20; attempt++) {
                if (instance.editor.tokenize('{', id)[0]?.some((token) => token.type !== '')) return
                await new Promise((resolve) => setTimeout(resolve, 50))
            }
        })()
        activated.set(id, pending)
    }
    return pending
}

/**
 * Monaco's colouring of one block, as the content of its `<code>`. Monaco escapes the text it is
 * given and emits only its own token spans, writing spaces as no-break spaces and ending each line
 * with `<br/>`; both go back to what they were, so the block's text stays its source.
 */
async function colourise(instance: MonacoType, id: string, text: string): Promise<string> {
    await activate(instance, id)
    const html = await instance.editor.colorize(text, id, {})
    return html
        .replace(/<br\/>$/, '')
        .replaceAll('<br/>', '\n')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('\u00a0', ' ')
}

/**
 * Colours the blocks under `root` in the editor's theme, unless `isCurrent` says the render they
 * belong to has been replaced. A block seen before under the same theme is coloured without
 * asking Monaco again.
 */
export async function colourCodeBlocksWithMonaco(
    root: ParentNode,
    theme: monaco.editor.IStandaloneThemeData,
    isCurrent: () => boolean
): Promise<void> {
    const blocks = blocksToColour(root)
    if (blocks.length === 0) return
    const { Monaco } = await import('#lib/monaco/Monaco.ts')
    const instance = await Monaco.get()
    if (!isCurrent()) return
    //the editor's own theme, which nothing may have set yet where no editor is open
    const themeKey = JSON.stringify(theme)
    if (themeKey !== colouredUnder) {
        Monaco.setCustomTheme(theme)
        colouredUnder = themeKey
        coloured.clear()
    }
    for (const block of blocks) {
        const key = `${block.name}\n${block.text}`
        let html = coloured.get(key)
        if (html === undefined) {
            const id = monacoLanguageId(instance, block.name)
            html = id ? await colourise(instance, id, block.text) : null
            coloured.set(key, html)
            if (!isCurrent()) return
        }
        if (html !== null) {
            block.code.innerHTML = html
            block.code.classList.add('monaco-colours')
        }
    }
}
