import { x86InstructionAliases } from '#lib/languages/X86/X86-documentation.ts'
import type { DocumentationLanguage } from '#lib/search/scope.ts'

/**
 * The mnemonics that are another spelling of a documented instruction, by the instruction they
 * stand for. Each keeps its own page, so a link to it still works, but the page names the main
 * instruction's page as canonical and stays out of the sitemap, and the main instruction's page
 * lists it under "Also written as". Plain data, so the documentation routes can import it while
 * prerendering.
 */
const ALIASES: Partial<Record<DocumentationLanguage, ReadonlyMap<string, string>>> = {
    x86: x86InstructionAliases,
    // The ones the RISC-V names table already calls an alias or an older name of another.
    'risc-v': new Map([
        ['fmv.s.x', 'fmv.w.x'],
        ['fmv.x.s', 'fmv.x.w'],
        ['frsr', 'frcsr'],
        ['fssr', 'fscsr']
    ])
}

/** The instruction `name` is a spelling of, or undefined when it is an instruction of its own. */
export function aliasTarget(language: DocumentationLanguage, name: string): string | undefined {
    return ALIASES[language]?.get(name)
}

/** The other spellings of `name`, in the order they are listed. */
export function aliasesOf(language: DocumentationLanguage, name: string): string[] {
    const aliases = ALIASES[language]
    if (!aliases) return []
    return [...aliases].filter(([, main]) => main === name).map(([alias]) => alias)
}
