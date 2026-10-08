import {
    formatAggregatedArgs,
    riscvDirectivesMap,
    riscvInstructionEntries,
    riscvRegisterFiles,
    riscvSyscall
} from '$lib/languages/RISC-V/RISC-V-documentation'
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
import { documented, syscallFields, syscallSummary } from '../mars/syscalls'
import directivesIntro from './directives.md?raw'
import runtimeIntro from './runtime-library.md?raw'
import usingCIntro from './using-c.md?raw'
import runtimeFunctions from '$lib/sourceRuntime/generated/v1/functions.json'
import { riscvCallingConvention } from '$lib/sourceRuntime/runtimeLanguage'
import type { RuntimeFunctionList } from '$lib/sourceRuntime/runtimeLibrary'
import registersIntro from './registers.md?raw'
import syscallsIntro from './syscalls.md?raw'
import { riscvInstructionContent } from './instructionContent'
import { withInstructionContent } from '../instructions/resolve'

/**
 * The RISC-V Documentation, which RISC-V-64 Projects read too: the instruction list is the RV64
 * one, and an instruction that exists only there says so.
 */

const BASE = '/documentation/risc-v'

function instructions(): Chapter {
    const entries = riscvInstructionEntries.map(([mnemonic, variants]): DocumentationEntry => {
        const descriptions = [...new Set(variants.map((variant) => variant.description))]
        return withInstructionContent(
            {
                id: `risc-v/instructions/${mnemonic}`,
                language: 'risc-v',
                chapter: 'instructions',
                kind: 'instruction',
                title: mnemonic,
                names: names(mnemonic),
                signature: formatAggregatedArgs(variants),
                summary: summaryOf(variants[0].description),
                href: `${BASE}/instruction/${mnemonic}`,
                anchor: mnemonic,
                view: { type: 'riscv-instruction', variants },
                searchText: descriptions.join('\n'),
                code: [...new Set(variants.map((variant) => variant.example))].join('\n')
            },
            riscvInstructionContent[mnemonic]
        )
    })
    return {
        id: 'instructions',
        language: 'risc-v',
        title: 'Instructions',
        href: `${BASE}/instruction`,
        description: 'Every instruction and pseudo-instruction of RV32 and RV64.',
        entries
    }
}

function directives(): Chapter {
    const href = `${BASE}/directive`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language: 'risc-v',
            chapter: 'directives',
            chapterHref: href,
            markdown: directivesIntro
        }),
        ...Object.values(riscvDirectivesMap).map((directive): DocumentationEntry => ({
            id: `risc-v/directives/${directive.name}`,
            language: 'risc-v',
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
        language: 'risc-v',
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
            language: 'risc-v',
            chapter: 'syscalls',
            chapterHref: href,
            markdown: syscallsIntro
        }),
        ...documented(riscvSyscall).map((syscall): DocumentationEntry => ({
            id: `risc-v/syscalls/${syscall.code}`,
            language: 'risc-v',
            chapter: 'syscalls',
            kind: 'syscall',
            title: capitalize(syscall.name),
            names: names(syscall.name, `syscall ${syscall.code}`, `ecall ${syscall.code}`),
            signature: `a7 = ${syscall.code}`,
            summary: syscallSummary(syscall),
            href: `${href}#service-${syscall.code}`,
            anchor: `service-${syscall.code}`,
            view: { type: 'fields', fields: syscallFields(syscall) },
            searchText: `Service ${syscall.code}. ${syscallSummary(syscall)} ${syscall.result.other ?? ''}`
        }))
    ]
    return {
        id: 'syscalls',
        language: 'risc-v',
        title: 'Syscalls',
        href,
        description:
            'RARS simulator services selected by the number in `a7`, with arguments and results in the registers listed for each service.',
        entries
    }
}

function registerAnchor(file: string, name: string): string {
    return `${file}-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`
}

function registers(): Chapter {
    const href = `${BASE}/registers`
    const files = riscvRegisterFiles.flatMap((file) => [
        {
            id: `risc-v/registers/${file.id}`,
            language: 'risc-v',
            chapter: 'registers',
            kind: 'prose',
            title: file.title,
            names: [],
            summary: summaryOf(file.intro),
            href: `${href}#${file.id}`,
            anchor: file.id,
            view: { type: 'markdown', markdown: file.intro },
            searchText: file.intro
        } satisfies DocumentationEntry,
        ...file.registers.map((register): DocumentationEntry => ({
            id: `risc-v/registers/${registerAnchor(file.id, register.name)}`,
            language: 'risc-v',
            chapter: 'registers',
            kind: 'register',
            title: register.name,
            names: names(...registerRange(register.name), ...registerRange(register.number)),
            signature: register.number,
            summary: summaryOf(register.description),
            href: `${href}#${registerAnchor(file.id, register.name)}`,
            anchor: registerAnchor(file.id, register.name),
            view: { type: 'markdown', markdown: register.description },
            searchText: `${file.title}. ${register.description}`
        }))
    ])
    return {
        id: 'registers',
        language: 'risc-v',
        title: 'Registers',
        href,
        description: 'The general purpose registers, the FPU and the control and status registers.',
        entries: [
            ...proseEntries({
                language: 'risc-v',
                chapter: 'registers',
                chapterHref: href,
                markdown: registersIntro
            }),
            ...files
        ]
    }
}

function screen(): Chapter {
    const href = `${BASE}/screen`
    return {
        id: 'screen',
        language: 'risc-v',
        title: 'Screen',
        href,
        description: 'The bitmap display, the keyboard and console registers, and program time.',
        entries: screenEntries('RISC-V', 'risc-v', href)
    }
}

/** The C library a Build links when the Project or its Compilation asks for it. */
function runtimeLibrary(): Chapter {
    const href = `${BASE}/runtime-library`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language: 'risc-v',
            chapter: 'runtime-library',
            chapterHref: href,
            markdown: runtimeIntro
        }),
        ...(runtimeFunctions as RuntimeFunctionList).functions.map((entry): DocumentationEntry => {
            const convention = riscvCallingConvention(entry.prototype)
            return {
                id: `risc-v/runtime-library/${entry.name}`,
                language: 'risc-v',
                chapter: 'runtime-library',
                kind: 'function',
                title: entry.name,
                names: names(entry.name),
                signature: `<${entry.header}>`,
                summary: summaryOf(entry.doc),
                href: `${href}#${entry.name}`,
                anchor: entry.name,
                view: {
                    type: 'fields',
                    markdown: entry.doc,
                    fields: [
                        { label: 'Declaration', value: `\`${entry.prototype}\`` },
                        { label: 'Header', value: `\`<${entry.header}>\`` },
                        ...(convention ? [{ label: 'From assembly', value: convention }] : [])
                    ],
                    example: `call ${entry.name}`
                },
                searchText: `${entry.prototype}. ${entry.doc}`
            }
        })
    ]
    return {
        id: 'runtime-library',
        language: 'risc-v',
        title: 'Runtime library',
        href,
        description:
            'The C standard library compiled programs use, which hand-written assembly can call too.',
        entries
    }
}

function usingC(): Chapter {
    const href = `${BASE}/using-c`
    return {
        id: 'using-c',
        language: 'risc-v',
        title: 'Using C and C++',
        href,
        description:
            'Compile C or C++ for RV32 and RV64, call simulator services through <sim.h>, and debug the generated assembly.',
        entries: proseEntries({
            language: 'risc-v',
            chapter: 'using-c',
            chapterHref: href,
            markdown: usingCIntro,
            openingTitle: 'Using C and C++'
        })
    }
}

let cached: Chapter[] | null = null

export function chapters(): Chapter[] {
    cached ??= [
        instructions(),
        directives(),
        syscalls(),
        registers(),
        screen(),
        runtimeLibrary(),
        usingC()
    ]
    return cached
}
