import runtimeFunctions from '@asm-editor/runtime/generated/v1/functions.json'
import type { DocumentationLanguage } from '#lib/search/scope.ts'
import type { RuntimeFunctionList } from '#lib/sourceRuntime/runtimeLibrary.ts'
import { names, proseEntries, summaryOf, type Chapter, type DocumentationEntry } from './entries'

function runtimeFunctionDocumentation(name: string, documentation: string): string {
    switch (name) {
        case 'malloc':
            return `${documentation} Returned memory meets the compiler's \`max_align_t\` alignment.`
        case 'clock':
            return `${documentation} Waiting time is excluded, and Undo rewinds the instruction counter.`
        case 'time':
            return `${documentation} Testcases use 2000-01-01 UTC plus virtual elapsed time.`
        case 'setvbuf':
            return 'Sets output buffering (`_IOFBF`, `_IOLBF` or `_IONBF`). Requests to buffer input fail; input remains unbuffered. Returns 0, or nonzero on failure.'
        case 'getenv':
            return 'Always returns NULL; the editor Runtime library does not expose environment variables through this function.'
        case 'exit':
            return 'Runs atexit handlers and static destructors, flushes output streams, then ends the program with the given status.'
        default:
            return documentation
    }
}

/**
 * The C library a Build links when the Project or its Compilation asks for it, the same functions
 * in every language that has one: its introduction, then each function with where its arguments go
 * and the instruction that calls it.
 */
export function runtimeLibraryChapter(options: {
    language: DocumentationLanguage
    base: string
    intro: string
    convention: (prototype: string) => string
    /** The mnemonic of a call from assembly: `jal` or `call`. */
    call: string
    description: string
}): Chapter {
    const { language, base, intro, convention, call, description } = options
    const href = `${base}/runtime-library`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language,
            chapter: 'runtime-library',
            chapterHref: href,
            markdown: intro
        }),
        ...(runtimeFunctions as RuntimeFunctionList).functions.map((entry): DocumentationEntry => {
            const placement = convention(entry.prototype)
            const doc = runtimeFunctionDocumentation(entry.name, entry.doc)
            return {
                id: `${language}/runtime-library/${entry.name}`,
                language,
                chapter: 'runtime-library',
                kind: 'function',
                title: entry.name,
                names: names(entry.name),
                signature: `<${entry.header}>`,
                summary: summaryOf(doc),
                href: `${href}#${entry.name}`,
                anchor: entry.name,
                view: {
                    type: 'fields',
                    markdown: doc,
                    fields: [
                        { label: 'Declaration', value: `\`${entry.prototype}\`` },
                        { label: 'Header', value: `\`<${entry.header}>\`` },
                        ...(placement ? [{ label: 'From assembly', value: placement }] : [])
                    ],
                    example: `${call} ${entry.name}`
                },
                searchText: `${entry.prototype}. ${doc}`
            }
        })
    ]
    return { id: 'runtime-library', language, title: 'Runtime library', href, description, entries }
}
