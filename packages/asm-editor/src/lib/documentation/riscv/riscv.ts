import {
    riscvDirectivesMap,
    riscvInstructionEntries,
    riscvRegisterFiles,
    riscvSyscall
} from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import {
    names,
    proseEntries,
    registerRange,
    summaryOf,
    type Chapter,
    type DocumentationEntry
} from '../entries'
import { marsChapters } from '../mars/chapters'
import directivesIntro from './directives.md?raw'
import runtimeIntro from './runtime-library.md?raw'
import usingCIntro from './using-c.md?raw'
import { riscvCallingConvention } from '#lib/sourceRuntime/runtimeLanguage.ts'
import registersIntro from './registers.md?raw'
import syscallsIntro from './syscalls.md?raw'
import { riscvInstructionContent } from './instructionContent'
import { riscvInstructionCategories } from './categories'
import { riscvFormTags } from '../instructions/formTags'
import { riscvInstructionDocument } from '../mars/instructionDocument'

/**
 * The RISC-V Documentation, which RISC-V-64 Projects read too: the instruction list is the RV64
 * one, and a form that exists only there is tagged RV64 only.
 */

const BASE = '/documentation/risc-v'

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

let cached: Chapter[] | null = null

export function chapters(): Chapter[] {
    cached ??= marsChapters({
        language: 'risc-v',
        variant: 'RISC-V',
        base: BASE,
        instructionEntries: riscvInstructionEntries,
        instructionDocument: riscvInstructionDocument,
        instructionContent: riscvInstructionContent,
        categories: riscvInstructionCategories,
        formTags: riscvFormTags,
        directives: riscvDirectivesMap,
        syscalls: riscvSyscall,
        serviceRegister: 'a7',
        serviceWord: 'ecall',
        registers: registers(),
        convention: riscvCallingConvention,
        call: 'call',
        markdown: {
            directives: directivesIntro,
            syscalls: syscallsIntro,
            runtime: runtimeIntro,
            usingC: usingCIntro
        },
        descriptions: {
            instructions: 'Every instruction and pseudo-instruction of RV32 and RV64.',
            syscalls:
                'RARS simulator services selected by the number in `a7`, with arguments and results in the registers listed for each service.',
            usingC: 'Compile C or C++ for RV32 and RV64, call simulator services through <sim.h>, and debug the generated assembly.'
        }
    })
    return cached
}
