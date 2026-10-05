import type { InstructionDocumentation } from '$lib/languages/M68K/M68K-documentation'
import type { MIPSInstruction } from '$lib/languages/MIPS/MIPS-documentation'
import type { RISCVInstruction } from '$lib/languages/RISC-V/RISC-V-documentation'
import type { X86Instruction } from '$lib/languages/X86/X86-documentation'
import type { Z80InstructionVariant } from '$lib/languages/Z80/Z80-documentation'
import { splitLecture } from '$lib/content/lectureSections'
import type { DocumentationLanguage } from '$lib/search/scope'

/**
 * The **Documentation** as a list of **Documentation entries** grouped in **Chapters**
 * ([ADR 0025](../../../docs/adr/0025-documentation-is-a-list-of-entries.md)). One list per language,
 * read by the Workbench's Documentation panel, the documentation pages and the search index alike,
 * so an entry is whatever one of them needs to show, find or link it on its own.
 *
 * The entries sit on top of the data modules (`*-documentation.ts`, `M68K-traps.ts`,
 * `Z80-model.ts`…), which the editor's hovers, grammars and agent prompts keep reading directly;
 * nothing here is imported back by them.
 */

export type EntryKind =
    | 'instruction'
    | 'directive'
    | 'syscall'
    | 'trap-task'
    | 'register'
    | 'flag'
    | 'condition-code'
    | 'addressing-mode'
    | 'port'
    | 'screen-command'
    | 'extension-group'
    | 'function'
    | 'prose'

/** A labelled value of an entry: a syscall's argument, a port's read side. `value` is markdown. */
export type EntryField = { label: string; value: string }

export type EntrySwatch = { name: string; color: string; value: string }

/** What an expanded row and a Chapter page show; each kind of view has its own renderer. */
export type EntryView =
    | { type: 'markdown'; markdown: string }
    | {
          type: 'fields'
          markdown?: string
          fields: EntryField[]
          /** A code sample, shown after the fields, in the language's own syntax. */
          example?: string
          /** Fields about the sample, shown after it: what it reads, prints or shows. */
          after?: EntryField[]
      }
    | { type: 'swatches'; markdown?: string; swatches: EntrySwatch[] }
    | { type: 'm68k-instruction'; instruction: InstructionDocumentation }
    | { type: 'mips-instruction'; variants: MIPSInstruction[] }
    | { type: 'riscv-instruction'; variants: RISCVInstruction[] }
    | { type: 'x86-instruction'; instruction: X86Instruction }
    | { type: 'z80-instruction'; variants: Z80InstructionVariant[] }

/** Kinds whose names are code (`move`, `.data`, `$t0`), set in the code font; the rest are words. */
const CODE_NAMED_KINDS = new Set<EntryKind>([
    'instruction',
    'function',
    'directive',
    'register',
    'flag',
    'condition-code'
])

/**
 * Whether an entry's name is code. An entry can say so itself, where its kind is spelled both ways:
 * an M68K addressing mode is named in words ("Direct"), a Z80 operand placeholder in code (`(hl)`).
 */
export function hasCodeName(entry: { kind: EntryKind; codeName?: boolean }): boolean {
    return entry.codeName ?? CODE_NAMED_KINDS.has(entry.kind)
}

export type DocumentationEntry = {
    /** `<language>/<chapter>/<anchor>`: stable, unique within the language. */
    id: string
    language: DocumentationLanguage
    /** The Chapter's id. */
    chapter: string
    kind: EntryKind
    /** The row's name: a mnemonic, a directive, a service's name, a section heading. */
    title: string
    /** What an exact-name search matches, lowercase: `move`, `beq`, `.data`, `syscall 1`. */
    names: string[]
    /** What the row shows after the name: operands, a number, a port. */
    signature?: string
    /** Whether the name is code, where the entry's kind does not settle it (see `hasCodeName`). */
    codeName?: boolean
    /** One line of plain text. */
    summary: string
    /** Its own page, or its Chapter's page at its anchor. */
    href: string
    /** Its id on its Chapter's page. */
    anchor: string
    view: EntryView
    /** Markdown the index reads besides the title and the summary. */
    searchText: string
    /** Example code the index reads, with a lower weight than text. */
    code?: string
}

export type Chapter = {
    /** Stable: `instructions`, `directives`, `trap-tasks`… */
    id: string
    language: DocumentationLanguage
    title: string
    /** The Chapter's page on the documentation site. */
    href: string
    /** One line: what the Chapter covers. */
    description: string
    entries: DocumentationEntry[]
}

/** Markdown reduced to one plain line: links to their text, code and emphasis to their words. */
export function plainText(markdown: string): string {
    return (
        markdown
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/<[^>]+>/g, ' ')
            .replace(/`+/g, '')
            .replace(/^#+\s*/gm, '')
            .replace(/^\s*>\s?/gm, '')
            .replace(/^\s*[-+*]\s+/gm, '')
            // emphasis only where markdown reads it, a marker against a word, never one inside a word:
            // `exit_group` and `o_stat` keep their underscores
            .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
            .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
            .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
            .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
            .replace(/\|/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    )
}

/** Stands in for the dot of an "e.g." or an "i.e." while the end of a sentence is looked for. */
const HELD_DOT = '\u2024'

/** The first sentence of some markdown, as plain text, cut to fit one row. */
export function summaryOf(markdown: string, max = 160): string {
    const text = plainText(markdown).replace(/\b(e\.g|i\.e)\.(?=\s)/g, `$1${HELD_DOT}`)
    const sentence = (/^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text).split(HELD_DOT).join('.')
    if (sentence.length <= max) return sentence
    const cut = sentence.slice(0, max)
    return cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : max).trimEnd() + '…'
}

/**
 * Every register a range names, so that `$t3` finds `$t0 - $t7`: `$t0 - $t7`, `a0 - a7`, `$8 - $15`,
 * `x10 - x17`. A name that is no range comes back alone.
 */
export function registerRange(name: string): string[] {
    const range = /^(\$?[a-z]*)(\d+)\s*-\s*(\$?[a-z]*)(\d+)$/i.exec(name.trim())
    if (!range || range[1] !== range[3]) return [name]
    const from = Number(range[2])
    const to = Number(range[4])
    if (!(to > from) || to - from > 64) return [name]
    return Array.from({ length: to - from + 1 }, (_, i) => `${range[1]}${from + i}`)
}

/** Lowercase names, without blanks and duplicates. */
export function names(...values: (string | undefined | null)[]): string[] {
    const out = values
        .filter((value): value is string => !!value && !!value.trim())
        .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
    return [...new Set(out)]
}

/**
 * Entries from a markdown file split at its second-level headings, the way the prose of the
 * Documentation is kept ([ADR 0025](../../../docs/adr/0025-documentation-is-a-list-of-entries.md)):
 * each heading is an entry, its id the heading's slug. A heading can name its id instead, as
 * `## Keyboard and display registers {#keyboard-and-display}`, so an anchor that pages already
 * link to survives a better heading. Text before the first heading becomes an entry titled
 * `openingTitle`, and is dropped without one.
 */
export function proseEntries(options: {
    language: DocumentationLanguage
    chapter: string
    chapterHref: string
    markdown: string
    kind?: EntryKind
    openingTitle?: string
}): DocumentationEntry[] {
    const { language, chapter, chapterHref, markdown, kind = 'prose', openingTitle } = options
    return splitLecture(markdown).flatMap((section) => {
        const heading = section.title ?? openingTitle
        if (!heading) return []
        const named = /\s*\{#([\w-]+)\}\s*$/.exec(heading)
        const title = named ? heading.slice(0, named.index).trim() : heading
        const anchor = named ? named[1] : section.slug || 'overview'
        return [
            {
                id: `${language}/${chapter}/${anchor}`,
                language,
                chapter,
                kind,
                title,
                names: [],
                summary: summaryOf(section.markdown),
                href: `${chapterHref}#${anchor}`,
                anchor,
                view: { type: 'markdown', markdown: section.markdown },
                searchText: section.markdown,
                code: section.code || undefined
            } satisfies DocumentationEntry
        ]
    })
}

/** Replaces `{name}` placeholders, for prose that two languages share (the MARS and RARS Screen). */
export function fillPlaceholders(markdown: string, values: Record<string, string>): string {
    return markdown.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

/** Checks a language's Chapters: unique ids and anchors, and something to show for every entry. */
export function documentationProblems(chapters: Chapter[]): string[] {
    const problems: string[] = []
    const ids = new Set<string>()
    for (const chapter of chapters) {
        const anchors = new Set<string>()
        for (const entry of chapter.entries) {
            if (ids.has(entry.id)) problems.push(`duplicate id ${entry.id}`)
            ids.add(entry.id)
            if (anchors.has(entry.anchor)) {
                problems.push(`duplicate anchor ${entry.anchor} in ${chapter.id}`)
            }
            anchors.add(entry.anchor)
            if (entry.chapter !== chapter.id)
                problems.push(`${entry.id} names chapter ${entry.chapter}`)
            if (!entry.title.trim()) problems.push(`${entry.id} has no title`)
            if (!entry.summary.trim()) problems.push(`${entry.id} has no summary`)
            if (!entry.searchText.trim() && !entry.summary.trim()) {
                problems.push(`${entry.id} has no text`)
            }
            for (const name of entry.names) {
                if (name !== name.toLowerCase().trim()) {
                    problems.push(`${entry.id} has a name that is not lowercase: ${name}`)
                }
            }
        }
    }
    return problems
}
