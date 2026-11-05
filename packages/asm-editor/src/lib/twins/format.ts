import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type { DocumentationLanguage } from '#lib/search/scope.ts'

/** How a **Markdown twin** writes the pieces it puts together from data rather than from markdown. */

function longestRun(text: string, char: string): number {
    let longest = 0
    let run = 0
    for (const c of text) {
        run = c === char ? run + 1 : 0
        longest = Math.max(longest, run)
    }
    return longest
}

/** Inline code, with a fence of backticks longer than any run inside it. */
export function codeSpan(text: string): string {
    const ticks = '`'.repeat(longestRun(text, '`') + 1)
    const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
    return `${ticks}${pad}${text}${pad}${ticks}`
}

/** A fenced code block in `language`, fenced longer than any run of backticks in the code. */
export function codeBlock(code: string, language = ''): string {
    const fence = '`'.repeat(Math.max(3, longestRun(code, '`') + 1))
    return `${fence}${language}\n${code.replace(/\n+$/, '')}\n${fence}`
}

/** Text set inside a link's brackets. */
export function linkText(text: string): string {
    return text.replace(/[\\[\]]/g, (char) => `\\${char}`)
}

export function link(text: string, url: string): string {
    return `[${text}](${url.replace(/[ ()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)})`
}

/** Blocks of markdown, each trimmed, the empty ones left out, a blank line between the rest. */
export function blocks(...parts: (string | number | undefined | null | false)[]): string {
    return `${parts
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .map((part) => part.trim())
        .join('\n\n')}\n`
}

/** A list item's text on one line, as a twin's lists write each one. */
export function oneLine(text: string): string {
    return text.replace(/\s*\n\s*/g, ' ').trim()
}

/** The name a code fence gives each language, the one its Playgrounds use. */
const FENCE_NAMES: Record<AvailableLanguages | DocumentationLanguage, string> = {
    M68K: 'm68k',
    MIPS: 'mips',
    'RISC-V': 'riscv',
    'RISC-V-64': 'riscv64',
    X86: 'x86',
    Z80: 'z80',
    m68k: 'm68k',
    mips: 'mips',
    'risc-v': 'riscv',
    x86: 'x86',
    z80: 'z80'
}

export function fenceName(language: AvailableLanguages | DocumentationLanguage): string {
    return FENCE_NAMES[language]
}

/** A twin as the endpoint serves it. */
export function markdownResponse(markdown: string): Response {
    return new Response(markdown, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    })
}

/** An agents' own text file: `/llms.txt` and the `llms-full.txt` of each search shard. */
export function textResponse(text: string): Response {
    return new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
}
