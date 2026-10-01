import {
    formatAggregatedArgs,
    mipsDirectivesMap,
    mipsInstructionEntries,
    mipsRegisterFiles,
    mipsRegisters,
    mipsSyscall
} from '$lib/languages/MIPS/MIPS-documentation'
import { capitalize } from '$lib/utils'
import {
    names,
    proseEntries,
    registerRange,
    summaryOf,
    type Chapter,
    type DocumentationEntry
} from '../entries'
import { screenEntries } from '../mars/screen'
import { syscallFields, syscallSummary } from '../mars/syscalls'
import directivesIntro from './directives.md?raw'
import registersIntro from './registers.md?raw'
import syscallsIntro from './syscalls.md?raw'

const BASE = '/documentation/mips'

function instructions(): Chapter {
    const entries = mipsInstructionEntries.map(([mnemonic, variants]): DocumentationEntry => {
        const descriptions = [...new Set(variants.map((variant) => variant.description))]
        return {
            id: `mips/instructions/${mnemonic}`,
            language: 'mips',
            chapter: 'instructions',
            kind: 'instruction',
            title: mnemonic,
            names: names(mnemonic),
            signature: formatAggregatedArgs(variants),
            summary: summaryOf(variants[0].description),
            href: `${BASE}/instruction/${mnemonic}`,
            anchor: mnemonic,
            view: { type: 'mips-instruction', variants },
            searchText: descriptions.join('\n'),
            code: [...new Set(variants.map((variant) => variant.example))].join('\n')
        }
    })
    return {
        id: 'instructions',
        language: 'mips',
        title: 'Instructions',
        href: `${BASE}/instruction`,
        description: 'Every instruction and pseudo-instruction the assembler accepts.',
        entries
    }
}

function directives(): Chapter {
    const href = `${BASE}/directive`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language: 'mips',
            chapter: 'directives',
            chapterHref: href,
            markdown: directivesIntro
        }),
        ...Object.values(mipsDirectivesMap).map((directive): DocumentationEntry => ({
            id: `mips/directives/${directive.name}`,
            language: 'mips',
            chapter: 'directives',
            kind: 'directive',
            title: `.${directive.name}`,
            names: names(`.${directive.name}`),
            summary: summaryOf(directive.description),
            href: `${href}#${directive.name}`,
            anchor: directive.name,
            view: { type: 'markdown', markdown: directive.description },
            searchText: directive.description
        }))
    ]
    return {
        id: 'directives',
        language: 'mips',
        title: 'Directives',
        href,
        description: 'What the assembler does with the lines that start with a dot.',
        entries
    }
}

function syscalls(): Chapter {
    const href = `${BASE}/syscall`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language: 'mips',
            chapter: 'syscalls',
            chapterHref: href,
            markdown: syscallsIntro
        }),
        ...Object.values(mipsSyscall).map((syscall): DocumentationEntry => ({
            id: `mips/syscalls/${syscall.code}`,
            language: 'mips',
            chapter: 'syscalls',
            kind: 'syscall',
            title: capitalize(syscall.name),
            names: names(syscall.name, `syscall ${syscall.code}`, `service ${syscall.code}`),
            signature: `$v0 = ${syscall.code}`,
            summary: syscallSummary(syscall),
            href: `${href}#service-${syscall.code}`,
            anchor: `service-${syscall.code}`,
            view: { type: 'fields', fields: syscallFields(syscall) },
            searchText: `Service ${syscall.code}. ${syscallSummary(syscall)} ${syscall.result.other ?? ''}`
        }))
    ]
    return {
        id: 'syscalls',
        language: 'mips',
        title: 'Syscalls',
        href,
        description: 'The services a program asks the simulator for with `syscall`.',
        entries
    }
}

/** `$8 - $15` → `register-8-15`: an id for a register or a run of them. */
function registerAnchor(text: string): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    return slug.startsWith('register') ? slug : `register-${slug}`
}

function registers(): Chapter {
    const href = `${BASE}/registers`
    const general = Object.values(mipsRegisters).map((register): DocumentationEntry => ({
        id: `mips/registers/${register.name}`,
        language: 'mips',
        chapter: 'registers',
        kind: 'register',
        title: register.name,
        names: names(...registerRange(register.name), ...registerRange(register.number)),
        signature: register.number,
        summary: summaryOf(register.description),
        href: `${href}#${registerAnchor(register.number)}`,
        anchor: registerAnchor(register.number),
        view: { type: 'markdown', markdown: register.description },
        searchText: `General purpose register ${register.number}. ${register.description}`
    }))
    const files = mipsRegisterFiles.flatMap((file) => [
        {
            id: `mips/registers/${file.id}`,
            language: 'mips',
            chapter: 'registers',
            kind: 'prose',
            title: file.title,
            names: names(file.id),
            summary: summaryOf(file.intro),
            href: `${href}#${file.id}`,
            anchor: file.id,
            view: { type: 'markdown', markdown: file.intro },
            searchText: file.intro
        } satisfies DocumentationEntry,
        ...file.registers.map((register): DocumentationEntry => ({
            id: `mips/registers/${file.id}-${register.name}`,
            language: 'mips',
            chapter: 'registers',
            kind: 'register',
            title: register.name,
            names: names(...registerRange(register.name)),
            signature: register.detail,
            summary: summaryOf(register.description),
            href: `${href}#${registerAnchor(`${file.id}-${register.name}`)}`,
            anchor: registerAnchor(`${file.id}-${register.name}`),
            view: { type: 'markdown', markdown: register.description },
            searchText: `${file.title}. ${register.description}`
        }))
    ])
    return {
        id: 'registers',
        language: 'mips',
        title: 'Registers',
        href,
        description: 'The general purpose registers, the FPU and coprocessor 0.',
        entries: [
            ...proseEntries({
                language: 'mips',
                chapter: 'registers',
                chapterHref: href,
                markdown: registersIntro
            }),
            ...general,
            ...files
        ]
    }
}

function screen(): Chapter {
    const href = `${BASE}/screen`
    return {
        id: 'screen',
        language: 'mips',
        title: 'Screen',
        href,
        description: 'The bitmap display, the keyboard and console registers, and program time.',
        entries: screenEntries('MIPS', 'mips', href)
    }
}

let cached: Chapter[] | null = null

export function chapters(): Chapter[] {
    cached ??= [instructions(), directives(), syscalls(), registers(), screen()]
    return cached
}
