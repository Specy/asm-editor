import { capitalize } from '#lib/utils.ts'
import { names, proseEntries, summaryOf, type Chapter, type DocumentationEntry } from '../entries'
import type { CategoryTable, InstructionTag } from '../instructions/categories'
import type { InstructionContent } from '../instructions/content'
import { documentSignature, type InstructionDocument } from '../instructions/document'
import { withInstructionCategory, withInstructionContent } from '../instructions/resolve'
import { runtimeLibraryChapter } from '../runtimeFunctions'
import { synthEntries } from '../synth'
import type { MarsForm } from './instructionDocument'
import { screenEntries } from './screen'
import { documented, syscallFields, syscallSummary, type MarsSyscall } from './syscalls'

/**
 * What the MIPS and the RISC-V Documentation differ in: they build the same Chapters but their
 * Registers. It is handed each Core's forms, directives and services rather than reading them, so
 * that it imports neither Core, as the rest of this folder.
 */
export type MarsDocumentation<F extends MarsForm> = {
    language: 'mips' | 'risc-v'
    /** The variant the shared Screen and Synth prose is written for. */
    variant: 'MIPS' | 'RISC-V'
    base: string
    instructionEntries: readonly (readonly [string, readonly F[]])[]
    instructionDocument: (
        mnemonic: string,
        forms: readonly F[],
        content?: InstructionContent
    ) => InstructionDocument
    instructionContent: Readonly<Record<string, InstructionContent>>
    categories: CategoryTable
    formTags: (form: F) => InstructionTag[]
    directives: Readonly<Record<string, { name: string; description: string }>>
    syscalls: Record<number, MarsSyscall>
    /** The register that selects a service: `$v0` or `a7`. */
    serviceRegister: string
    /** What a service is searched as besides `syscall <n>`: `service <n>` or `ecall <n>`. */
    serviceWord: string
    /** The language's own Registers Chapter, which follows the services. */
    registers: Chapter
    convention: (prototype: string) => string
    /** The mnemonic of a library call from assembly: `jal` or `call`. */
    call: string
    markdown: { directives: string; syscalls: string; runtime: string; usingC: string }
    descriptions: { instructions: string; syscalls: string; usingC: string }
}

function instructions<F extends MarsForm>(documentation: MarsDocumentation<F>): Chapter {
    const { language, base, instructionEntries, instructionContent } = documentation
    const entries = instructionEntries.map(([mnemonic, variants]): DocumentationEntry => {
        const descriptions = [...new Set(variants.map((variant) => variant.description))]
        const document = documentation.instructionDocument(
            mnemonic,
            variants,
            instructionContent[mnemonic]
        )
        const entry = withInstructionContent(
            {
                id: `${language}/instructions/${mnemonic}`,
                language,
                chapter: 'instructions',
                kind: 'instruction',
                title: mnemonic,
                names: names(mnemonic),
                signature: documentSignature(document),
                summary: document.summary,
                href: `${base}/instruction/${mnemonic}`,
                anchor: mnemonic,
                view: { type: 'instruction', document },
                searchText: [document.longName, ...descriptions].join('\n'),
                code: [...new Set(variants.map((variant) => variant.example))].join('\n')
            },
            instructionContent[mnemonic]
        )
        return withInstructionCategory(
            entry,
            documentation.categories[mnemonic],
            variants.map(documentation.formTags)
        )
    })
    return {
        id: 'instructions',
        language,
        title: 'Instructions',
        href: `${base}/instruction`,
        description: documentation.descriptions.instructions,
        entries
    }
}

function directives<F extends MarsForm>(documentation: MarsDocumentation<F>): Chapter {
    const { language, base } = documentation
    const href = `${base}/directive`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language,
            chapter: 'directives',
            chapterHref: href,
            markdown: documentation.markdown.directives
        }),
        ...Object.values(documentation.directives).map((directive): DocumentationEntry => ({
            id: `${language}/directives/${directive.name}`,
            language,
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
        language,
        title: 'Directives',
        href,
        description: 'What the assembler does with the lines that start with a dot.',
        entries
    }
}

function syscalls<F extends MarsForm>(documentation: MarsDocumentation<F>): Chapter {
    const { language, base, serviceRegister, serviceWord } = documentation
    const href = `${base}/syscall`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language,
            chapter: 'syscalls',
            chapterHref: href,
            markdown: documentation.markdown.syscalls
        }),
        ...documented(documentation.syscalls).map((syscall): DocumentationEntry => ({
            id: `${language}/syscalls/${syscall.code}`,
            language,
            chapter: 'syscalls',
            kind: 'syscall',
            title: capitalize(syscall.name),
            names: names(syscall.name, `syscall ${syscall.code}`, `${serviceWord} ${syscall.code}`),
            signature: `${serviceRegister} = ${syscall.code}`,
            summary: syscallSummary(syscall),
            href: `${href}#service-${syscall.code}`,
            anchor: `service-${syscall.code}`,
            view: { type: 'fields', fields: syscallFields(syscall) },
            searchText: `Service ${syscall.code}. ${syscallSummary(syscall)} ${syscall.result.other ?? ''}`
        }))
    ]
    return {
        id: 'syscalls',
        language,
        title: 'Syscalls',
        href,
        description: documentation.descriptions.syscalls,
        entries
    }
}

/**
 * The MIPS or RISC-V Documentation's Chapters, in the order the complete documentation page has
 * them: instructions, directives, services, the language's registers, the Screen, the Synth, the
 * Runtime library and Using C.
 */
export function marsChapters<F extends MarsForm>(documentation: MarsDocumentation<F>): Chapter[] {
    const { language, base, variant } = documentation
    return [
        instructions(documentation),
        directives(documentation),
        syscalls(documentation),
        documentation.registers,
        {
            id: 'screen',
            language,
            title: 'Screen',
            href: `${base}/screen`,
            description:
                'The bitmap display, the keyboard and console registers, and program time.',
            entries: screenEntries(variant, language, `${base}/screen`)
        },
        {
            id: 'synth',
            language,
            title: 'Synth',
            href: `${base}/synth`,
            description:
                'Control eight sound channels through memory registers, with waveforms, volume envelopes, programmable wavetables and sample playback.',
            entries: synthEntries(variant, language, `${base}/synth`)
        },
        runtimeLibraryChapter({
            language,
            base,
            intro: documentation.markdown.runtime,
            convention: documentation.convention,
            call: documentation.call,
            description:
                'The C standard library compiled programs use, which hand-written assembly can call too.'
        }),
        {
            id: 'using-c',
            language,
            title: 'Using C and C++',
            href: `${base}/using-c`,
            description: documentation.descriptions.usingC,
            entries: proseEntries({
                language,
                chapter: 'using-c',
                chapterHref: `${base}/using-c`,
                markdown: documentation.markdown.usingC,
                openingTitle: 'Using C and C++'
            })
        }
    ]
}
