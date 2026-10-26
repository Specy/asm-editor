import {
    mipsDirectivesMap,
    mipsInstructionEntries,
    mipsRegisterFiles,
    mipsRegisters,
    mipsSyscall
} from '#lib/languages/MIPS/MIPS-documentation.ts'
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
import registersIntro from './registers.md?raw'
import runtimeIntro from './runtime-library.md?raw'
import usingCIntro from './using-c.md?raw'
import { mipsCallingConvention } from '#lib/sourceRuntime/runtimeLanguage.ts'
import syscallsIntro from './syscalls.md?raw'
import { mipsInstructionContent } from './instructionContent'
import { mipsInstructionCategories } from './categories'
import { mipsFormTags } from '../instructions/formTags'
import { mipsInstructionDocument } from '../mars/instructionDocument'

const BASE = '/documentation/mips'

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

let cached: Chapter[] | null = null

export function chapters(): Chapter[] {
    cached ??= marsChapters({
        language: 'mips',
        variant: 'MIPS',
        base: BASE,
        instructionEntries: mipsInstructionEntries,
        instructionDocument: mipsInstructionDocument,
        instructionContent: mipsInstructionContent,
        categories: mipsInstructionCategories,
        formTags: mipsFormTags,
        directives: mipsDirectivesMap,
        syscalls: mipsSyscall,
        serviceRegister: '$v0',
        serviceWord: 'service',
        registers: registers(),
        convention: mipsCallingConvention,
        call: 'jal',
        markdown: {
            directives: directivesIntro,
            syscalls: syscallsIntro,
            runtime: runtimeIntro,
            usingC: usingCIntro
        },
        descriptions: {
            instructions: 'Every instruction and pseudo-instruction the assembler accepts.',
            syscalls:
                'MARS simulator services selected by the number in `$v0`, with arguments and results in the registers listed for each service.',
            usingC: 'Compile C or C++, call simulator services through <sim.h>, and debug the generated MIPS assembly.'
        }
    })
    return cached
}
