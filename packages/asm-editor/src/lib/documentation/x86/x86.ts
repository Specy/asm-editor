import { headingSlug } from '#lib/content/headings.ts'
import {
    X86_COMMON_SYSCALLS,
    X86_CONDITION_CODES,
    X86_DIRECTIVE_DOCS,
    X86_DIRECTIVES,
    X86_DOCUMENTED_REGISTER_FILES,
    X86_DOCUMENTED_SECTIONS,
    X86_FLAG_MEANINGS,
    X86_FLAGS,
    X86_PREFIX_DOCS,
    X86_PREPROCESSOR_DIRECTIVES,
    X86_PREPROCESSOR_DOCS,
    X86_PSEUDO_OP_DOCS,
    X86_REGISTERS,
    X86_SYSCALLS,
    describeX86Instruction,
    X86_SUMMARY_OVERRIDES,
    describeX86Syscall,
    formatX86Form,
    x86DocumentedInstructions,
    x86InstructionsBySection,
    x86SyscallArgs,
    x86SyscallMap,
    type X86Instruction,
    type X86Syscall,
    type X86TokenDoc
} from '#lib/languages/X86/X86-documentation.ts'
import { capitalize } from '#lib/utils.ts'
import { x86IsUnsupported, x86List, x86Support } from '#lib/languages/X86/x86Support.ts'
import {
    fillPlaceholders,
    names,
    proseEntries,
    summaryOf,
    type Chapter,
    type DocumentationEntry,
    type EntryField
} from '../entries'
import { x86InstructionCategories } from './categories'
import { VECTOR_CATEGORIES, VECTOR_SECTIONS, vectorCategory } from './vectorCategories'
import { x86FormTags } from '../instructions/formTags'
import { withInstructionCategory } from '../instructions/resolve'
import { documentSignature } from '../instructions/document'
import { isShortEncoding, x86InstructionDocument } from './instructionDocument'
import directivesProse from './directives.md?raw'
import extensionsProse from './extensions.md?raw'
import registersProse from './registers.md?raw'
import syscallsProse from './syscalls.md?raw'
import usingCProse from './using-c.md?raw'
import executablesProse from './executables.md?raw'
import vectorProse from './vector-instructions.md?raw'
import runtimeProse from './runtime-library.md?raw'
import runtimeFunctions from '@asm-editor/runtime/generated/v1/functions.json'
import { runtimeFunctionDocumentation } from '../runtimeFunctions'
import type { RuntimeFunctionList } from '#lib/sourceRuntime/runtimeLibrary.ts'
import { x86CallingConvention } from '#lib/sourceRuntime/runtimeLanguage.ts'
import {
    x86SimBinding,
    x86SimPrototype,
    X86_SIM_EXCEPTIONS,
    X86_SYSCALL_ARGUMENT_REGISTERS
} from './syscallBinding'

/**
 * The x86-64 Documentation. The integer instruction set has a page per instruction; every other
 * mnemonic NASM accepts is in an Extensions entry under the heading NASM files it under, so a
 * search finds every instruction the assembler knows, even where nothing describes it beyond one
 * line.
 */

const BASE = '/documentation/x86'

function code(text: string): string {
    return `\`${text}\``
}

/**
 * A Chapter's prose sections in the order its file has them, each followed by the entries that
 * belong under it, so the file decides where the data goes. A section the data names and the file
 * lacks is an error rather than entries that silently vanish.
 */
function interleave(
    prose: DocumentationEntry[],
    after: Record<string, DocumentationEntry[]>
): DocumentationEntry[] {
    const missing = Object.keys(after).filter(
        (anchor) => !prose.some((entry) => entry.anchor === anchor)
    )
    if (missing.length > 0) throw new Error(`The x86 prose has no section #${missing.join(', #')}`)
    return prose.flatMap((entry) => [entry, ...(after[entry.anchor] ?? [])])
}

// --- instructions -------------------------------------------------------------------------------

function instructions(): Chapter {
    const entries = [...x86DocumentedInstructions]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((instruction): DocumentationEntry => {
            const description = describeX86Instruction(instruction.name)
            const document = x86InstructionDocument(instruction)
            const forms = instruction.forms.map((form) => formatX86Form(instruction.name, form))
            const entry: DocumentationEntry = {
                id: `x86/instructions/${instruction.name}`,
                language: 'x86',
                chapter: 'instructions',
                kind: 'instruction',
                title: instruction.name,
                names: names(instruction.name),
                signature: documentSignature(document, isShortEncoding),
                summary: document.summary,
                href: `${BASE}/instruction/${instruction.name}`,
                anchor: instruction.name,
                view: { type: 'instruction', document: () => document },
                // The section too: the rows are alphabetical, so NASM's heading is only found here.
                searchText: [
                    ...new Set([
                        description,
                        document.longName,
                        document.summary,
                        instruction.section
                    ])
                ]
                    .filter(Boolean)
                    .join('\n'),
                code: [...new Set(forms)].join('\n')
            }
            return withInstructionCategory(
                entry,
                x86InstructionCategories[instruction.name],
                instruction.forms.map(x86FormTags)
            )
        })
    return {
        id: 'instructions',
        language: 'x86',
        title: 'Instructions',
        href: `${BASE}/instruction`,
        description: 'The integer instruction set, with the operand forms NASM accepts.',
        entries
    }
}

// --- extensions ---------------------------------------------------------------------------------

/** How many mnemonics an Extensions row names before it says how many more there are. */
const LISTED_MEMBERS = 4

function memberSummary(members: X86Instruction[]): string {
    const all = members.map((member) => member.name)
    if (all.length <= LISTED_MEMBERS + 1) return all.join(', ')
    return `${all.slice(0, LISTED_MEMBERS).join(', ')} and ${all.length - LISTED_MEMBERS} more`
}

/**
 * `` - `aadd` — Atomically ADD ``: the mnemonic and its one line. In an integer section's group the
 * line names the extension too, `` - `jmpabs` (APX) ``, because that is the reason the instruction
 * is listed here; every other group's heading already names its extension. A mnemonic of a group
 * that runs in part and has no form the Core runs says so on its line.
 */
function memberLine(member: X86Instruction, withFeatures: boolean, notRun?: string): string {
    const text =
        X86_SUMMARY_OVERRIDES[member.name.toLowerCase()] ??
        member.summary.replaceAll('Singed', 'Signed')
    const summary = text ? ` — ${text}` : ''
    const features =
        withFeatures && member.features.length > 0 ? ` (${member.features.join(', ')})` : ''
    const unsupported = notRun ? ` *(${notRun})*` : ''
    return `- ${code(member.name)}${summary}${features}${unsupported}`
}

/** The extensions of the forms the Core is known not to run, without repeats. */
function missingFamilies(members: X86Instruction[], kind: 'family' | 'v-form'): string[] {
    return [
        ...new Set(
            members.flatMap((member) =>
                x86Support(member)
                    .missing.filter((reason) => reason.kind === kind)
                    .map((reason) => reason.family)
            )
        )
    ]
}

/**
 * What a group says first about the Core and its instructions: nothing when it is not known to
 * stop at any of them, the extension that is missing when it stops at all of them, and what is
 * left out when only some forms or mnemonics are.
 */
function supportNote(members: X86Instruction[]): string | undefined {
    const supports = members.map(x86Support)
    const families = missingFamilies(members, 'family')
    const vForms = missingFamilies(members, 'v-form')
    if (families.length === 0 && vForms.length === 0) return undefined
    if (members.every(x86IsUnsupported)) {
        if (families.length === 0) {
            const [first] = members
            return `**This emulator runs ${x86List(vForms)} only in its \`v\` form.** Write \`v${first.name}\`, not \`${first.name}\`: the encodings without the \`v\` prefix stop the program with SIGILL, an illegal instruction.`
        }
        return `**This emulator does not support ${x86List(families)}.** A program that reaches one of these instructions stops with SIGILL, an illegal instruction.`
    }
    // only where every other form is known to run can the note say that they do
    const rest = supports.every((support) => support.unknown === 0) ? ' the other forms run' : ''
    const sentences: string[] = []
    if (vForms.length > 0) {
        sentences.push(
            `${x86List(vForms)} instructions run only in their \`v\` form: a legacy encoding stops the program with SIGILL.`
        )
    }
    if (families.length > 0) {
        sentences.push(
            `The ${x86List(families)} forms of these instructions are not supported by this emulator${rest ? `;${rest}` : ''}.`
        )
    }
    return sentences.join(' ')
}

/**
 * The markdown of an Extensions group: its support note, then its mnemonics, under a label per kind
 * of work when the group is one of vector instructions ({@link VECTOR_SECTIONS}) the Core runs. A
 * mnemonic of a partly supported group that the Core is known not to run is marked on its line.
 */
function groupMarkdown(members: X86Instruction[], integer: boolean, vectors: boolean): string {
    const supports = new Map(members.map((member) => [member, x86Support(member)]))
    const mixed =
        members.some((member) => supports.get(member)!.any) && members.some(x86IsUnsupported)
    const line = (member: X86Instruction) => {
        const reasons = supports.get(member)!.missing
        let notRun: string | undefined
        if (mixed && x86IsUnsupported(member)) {
            notRun = reasons.every((reason) => reason.kind === 'v-form')
                ? `runs only as \`v${member.name}\``
                : `not supported: ${x86List([...new Set(reasons.map((reason) => reason.family))])}`
        }
        return memberLine(member, integer, notRun)
    }
    const note = supportNote(members)
    const vector =
        vectors &&
        members.some(
            (member) => supports.get(member)!.any && vectorCategory(member.name) !== undefined
        )
    const parts: string[] = note ? [note] : []
    if (!vector) {
        parts.push(members.map(line).join('\n'))
        return parts.join('\n\n')
    }
    const labelled = [
        ...VECTOR_CATEGORIES.map((category) => ({ label: category.label, id: category.id })),
        { label: 'Other', id: undefined }
    ]
    for (const { label, id } of labelled) {
        const inCategory = members.filter((member) => vectorCategory(member.name) === id)
        if (inCategory.length > 0) parts.push(`**${label}**\n\n${inCategory.map(line).join('\n')}`)
    }
    return parts.join('\n\n')
}

/**
 * One entry per NASM section without pages, plus one for the instructions of each integer section
 * that need an extension in every form (`jmpabs`, the APX conditional compares, `mulx`), which no
 * page listed before. With the Instructions they hold every mnemonic NASM accepts.
 */
function extensions(): Chapter {
    const href = `${BASE}/extensions`
    const documented = new Set(X86_DOCUMENTED_SECTIONS)
    const groups: { title: string; members: X86Instruction[]; integer: boolean }[] = []
    for (const [section, members] of x86InstructionsBySection) {
        if (!documented.has(section)) {
            groups.push({ title: section, members, integer: false })
            continue
        }
        const extended = members.filter((member) => member.features.length > 0)
        if (extended.length > 0) {
            groups.push({ title: `${section} (extensions)`, members: extended, integer: true })
        }
    }
    groups.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))
    const entries = groups.map(({ title, members, integer }): DocumentationEntry => {
        const anchor = headingSlug(title)
        const markdown = groupMarkdown(members, integer, VECTOR_SECTIONS.has(title))
        const features = [...new Set(members.flatMap((member) => member.features))].map((feature) =>
            [feature, X86_FLAG_MEANINGS[feature]].filter(Boolean).join(': ')
        )
        return {
            id: `x86/extensions/${anchor}`,
            language: 'x86',
            chapter: 'extensions',
            kind: 'extension-group',
            title,
            names: names(...members.map((member) => member.name)),
            signature: members.length === 1 ? '1 instruction' : `${members.length} instructions`,
            summary: memberSummary(members),
            href: `${href}#${anchor}`,
            anchor,
            view: { type: 'markdown', markdown },
            searchText: [markdown, ...features].join('\n')
        }
    })
    return {
        id: 'extensions',
        language: 'x86',
        title: 'Extensions',
        href,
        description: 'Extension mnemonics grouped under NASM’s headings, with a short summary.',
        entries: [
            ...proseEntries({
                language: 'x86',
                chapter: 'extensions',
                chapterHref: href,
                markdown: extensionsProse
            }),
            ...entries
        ]
    }
}

// --- directives ---------------------------------------------------------------------------------

/** The token groups of the Directives page, each under the prose section that introduces it. */
const TOKEN_GROUPS: { anchor: string; docs: X86TokenDoc[] }[] = [
    { anchor: 'directives', docs: X86_DIRECTIVE_DOCS },
    { anchor: 'data', docs: X86_PSEUDO_OP_DOCS },
    { anchor: 'preprocessor', docs: X86_PREPROCESSOR_DOCS },
    { anchor: 'prefixes', docs: X86_PREFIX_DOCS }
]

/** A doc can name several tokens at once: `db, dw, dd, dq` is four names. */
function tokenNames(doc: X86TokenDoc): string[] {
    return doc.name.split(',').map((name) => name.trim())
}

function tokenEntry(doc: X86TokenDoc, group: string, href: string): DocumentationEntry {
    // A `%` cannot stay in an anchor, and without it `%rep` would take the `rep` prefix's.
    const slug = headingSlug(doc.name)
    const anchor = group === 'preprocessor' ? `preprocessor-${slug}` : slug
    return {
        id: `x86/directives/${anchor}`,
        language: 'x86',
        chapter: 'directives',
        kind: 'directive',
        title: doc.name,
        names: names(...tokenNames(doc)),
        summary: summaryOf(doc.description),
        href: `${href}#${anchor}`,
        anchor,
        view: { type: 'markdown', markdown: doc.description },
        searchText: doc.description
    }
}

function directives(): Chapter {
    const href = `${BASE}/directive`
    // The word lists are text, not names: `float`, `list` and `common` are among them, and an exact
    // name comes first, so a search for "float" would open on a word list before the SSE registers.
    const prose = proseEntries({
        language: 'x86',
        chapter: 'directives',
        chapterHref: href,
        markdown: fillPlaceholders(directivesProse, {
            directives: X86_DIRECTIVES.map(code).join(' '),
            preprocessor: X86_PREPROCESSOR_DIRECTIVES.map(code).join(' ')
        })
    })
    return {
        id: 'directives',
        language: 'x86',
        title: 'Directives',
        href,
        description:
            'Sections, data, constants, macros and prefixes: what NASM reads besides instructions.',
        entries: interleave(
            prose,
            Object.fromEntries(
                TOKEN_GROUPS.map((group) => [
                    group.anchor,
                    group.docs.map((doc) => tokenEntry(doc, group.anchor, href))
                ])
            )
        )
    }
}

// --- registers and flags ------------------------------------------------------------------------

/** `r8 to r15` → `r8`…`r15`, `r8d to r15d` → `r8d`…`r15d`; any other name comes back alone. */
function registerNames(name: string): string[] {
    const range = /^([a-z]+)(\d+)([a-z]*) to ([a-z]+)(\d+)([a-z]*)$/.exec(name)
    if (!range || range[1] !== range[4] || range[3] !== range[6]) return [name]
    const from = Number(range[2])
    const to = Number(range[5])
    return Array.from(
        { length: to - from + 1 },
        (_, index) => `${range[1]}${from + index}${range[3]}`
    )
}

/**
 * The register data spells one apostrophe as `&apos;`, which the markdown renderer decoded on the
 * old page and a row's plain text would show as it is.
 */
function decodeApostrophes(text: string): string {
    return text.replace(/&apos;/g, "'")
}

function registersAndFlags(): Chapter {
    const chapter = 'registers-and-flags'
    const href = `${BASE}/registers`
    const entry = (
        anchor: string,
        content: Omit<DocumentationEntry, 'id' | 'language' | 'chapter' | 'href' | 'anchor'>
    ): DocumentationEntry => ({
        id: `x86/${chapter}/${anchor}`,
        language: 'x86',
        chapter,
        href: `${href}#${anchor}`,
        anchor,
        ...content
    })

    const registers = X86_REGISTERS.map((register) => {
        const description = decodeApostrophes(register.description)
        return entry(`register-${headingSlug(register.name)}`, {
            kind: 'register',
            title: register.name,
            names: names(...[register.name, ...register.parts].flatMap(registerNames)),
            signature: register.parts.join(', ') || undefined,
            summary: summaryOf(description),
            view: { type: 'markdown', markdown: description },
            searchText: description
        })
    })

    const flags = X86_FLAGS.map((flag) =>
        entry(`flag-${flag.name.toLowerCase()}`, {
            kind: 'flag',
            title: flag.name,
            names: names(flag.name),
            signature: `bit ${flag.bit}`,
            summary: summaryOf(flag.description),
            view: { type: 'markdown', markdown: flag.description },
            searchText: flag.description
        })
    )

    const files = X86_DOCUMENTED_REGISTER_FILES.flatMap((file) => [
        entry(file.id, {
            kind: 'prose',
            title: file.title,
            names: names(file.id),
            summary: summaryOf(file.intro),
            view: { type: 'markdown', markdown: file.intro },
            searchText: file.intro
        }),
        ...file.registers.map((register) =>
            entry(`${file.id}-${headingSlug(register.name)}`, {
                kind: 'register',
                title: register.name,
                names: names(...registerNames(register.name)),
                signature: `${register.bits} bit`,
                summary: summaryOf(register.description),
                view: { type: 'markdown', markdown: register.description },
                searchText: `${file.title}. ${register.description}`
            })
        )
    ])

    const conditions = X86_CONDITION_CODES.map((condition) => {
        const fields: EntryField[] = [
            { label: 'Meaning', value: condition.meaning },
            { label: 'Test', value: code(condition.test) }
        ]
        if (condition.aliases.length > 0) {
            fields.unshift({ label: 'Also written', value: condition.aliases.map(code).join(', ') })
        }
        return entry(`condition-${condition.code}`, {
            kind: 'condition-code',
            title: condition.code,
            names: names(condition.code, ...condition.aliases),
            signature: condition.test,
            summary: capitalize(condition.meaning),
            view: { type: 'fields', fields },
            searchText: fields.map((field) => `${field.label}: ${field.value}`).join('\n')
        })
    })

    return {
        id: chapter,
        language: 'x86',
        title: 'Registers & flags',
        href,
        description:
            'The general purpose registers, the flags, the SSE and x87 registers and the condition codes.',
        entries: interleave(
            proseEntries({ language: 'x86', chapter, chapterHref: href, markdown: registersProse }),
            {
                registers,
                // The floating point register files follow the flags, as they always have.
                flags: [...flags, ...files],
                'condition-codes': conditions
            }
        )
    }
}

// --- syscalls -----------------------------------------------------------------------------------

/** The registers a syscall reads its arguments from, in the order the kernel reads them. */
const ARGUMENT_REGISTERS: readonly string[] = X86_SYSCALL_ARGUMENT_REGISTERS

/**
 * A row's line for a call nothing describes: what it reads, from which register. It is plain text
 * already, and kept from `summaryOf`, which would take `o_stat` for emphasis and drop the `_`.
 */
function argumentSummary(syscall: X86Syscall): string {
    const takes = x86SyscallArgs(syscall).map(
        (argument, index) => `${argument} in ${ARGUMENT_REGISTERS[index] ?? `arg${index + 1}`}`
    )
    return takes.length > 0 ? `Takes ${takes.join(', ')}.` : 'Takes no arguments.'
}

/** A syscall's input registers, result register and any memory destinations it writes through. */
function syscallEntry(syscall: X86Syscall, href: string): DocumentationEntry {
    const description = describeX86Syscall(syscall.name)
    const arguments_ = x86SyscallArgs(syscall)
    const input = [
        `\`rax\` = ${syscall.number} (call number)`,
        ...arguments_.map((argument, index) => {
            const register = ARGUMENT_REGISTERS[index] ?? `arg${index + 1}`
            return `\`${register}\` = ${argument}`
        })
    ].join('; ')
    const binding = x86SimBinding(syscall)
    const output =
        syscall.name === 'rt_sigreturn'
            ? 'Restores the saved program state and does not return normally.'
            : binding?.noreturn
              ? 'Does not return; ends the program.'
              : '`rax` = result. Values from -1 through -4095 are error codes.'
    const outputBuffers = arguments_.flatMap((argument, index) => {
        const parameter = binding?.parameters[index]
        if (
            !argument.includes('(written by the kernel)') &&
            !(argument.startsWith('o_') && parameter?.type !== 'const void *') &&
            argument !== 'iovec array (written)' &&
            !(argument.startsWith('io_') && parameter?.type !== 'const void *')
        )
            return []
        const register = ARGUMENT_REGISTERS[index] ?? `arg${index + 1}`
        if (argument === 'iovec array (written)')
            return [`Buffers listed by the iovec array in \`${register}\` receive data.`]
        const parameterName = parameter?.name
        return [
            `Memory at the address in \`${register}\` is written by the call${parameterName ? ` (${parameterName})` : ''}.`
        ]
    })
    const fields: EntryField[] = [
        { label: 'In', value: input },
        { label: 'Out', value: [output, ...outputBuffers].join(' ') }
    ]
    if (syscall.blocking) {
        fields.push({
            label: 'Waits',
            value:
                syscall.name === 'wait4'
                    ? 'Returns immediately with ECHILD; this environment has no child processes.'
                    : 'This call can wait for the outside world.'
        })
    }
    //searched as MIPS's and RISC-V's are, without the C prototype
    const searchText = [description, ...fields.map((field) => `${field.label}: ${field.value}`)]
        .filter(Boolean)
        .join('\n')
    const prototype = binding
        ? `\`${x86SimPrototype(binding)}\``
        : X86_SIM_EXCEPTIONS[syscall.name]
          ? `None in \`<sim.h>\`: ${X86_SIM_EXCEPTIONS[syscall.name]}.`
          : undefined
    if (prototype) fields.push({ label: 'From C', value: prototype })
    const anchor = `syscall-${syscall.name}`
    return {
        id: `x86/syscalls/${anchor}`,
        language: 'x86',
        chapter: 'syscalls',
        kind: 'syscall',
        title: syscall.name,
        // Linux's own names, `exit_group` and `clock_gettime`, where MARS names a service in words.
        codeName: true,
        names: names(syscall.name, `syscall ${syscall.number}`),
        signature: `rax = ${syscall.number}`,
        summary: description ? summaryOf(description) : argumentSummary(syscall),
        href: `${href}#${anchor}`,
        anchor,
        view: { type: 'fields', markdown: description || undefined, fields },
        searchText
    }
}

function syscalls(): Chapter {
    const href = `${BASE}/syscall`
    const common = X86_COMMON_SYSCALLS.map((name) => x86SyscallMap.get(name)).filter(
        (syscall) => syscall !== undefined
    )
    const rest = X86_SYSCALLS.filter((syscall) => !X86_COMMON_SYSCALLS.includes(syscall.name))
    return {
        id: 'syscalls',
        language: 'x86',
        title: 'Syscalls',
        href,
        description:
            'The Linux calls this emulator implements, with register inputs, results, C wrapper names, and program arguments. Errors return as negative values in `rax`.',
        entries: interleave(
            proseEntries({
                language: 'x86',
                chapter: 'syscalls',
                chapterHref: href,
                markdown: syscallsProse
            }),
            {
                common: common.map((syscall) => syscallEntry(syscall, href)),
                all: rest.map((syscall) => syscallEntry(syscall, href))
            }
        )
    }
}

function usingC(): Chapter {
    const href = `${BASE}/using-c`
    return {
        id: 'using-c',
        language: 'x86',
        title: 'Using C and C++',
        href,
        description:
            'Compile C or C++, supply program arguments, use Runtime functions and Linux services, and debug the generated NASM assembly.',
        entries: proseEntries({
            language: 'x86',
            chapter: 'using-c',
            chapterHref: href,
            markdown: usingCProse,
            openingTitle: 'Using C and C++'
        })
    }
}

/** The vector registers and the instructions that use them, and what this emulator runs of them. */
function vectorInstructions(): Chapter {
    const href = `${BASE}/vector-instructions`
    return {
        id: 'vector-instructions',
        language: 'x86',
        title: 'Vector instructions',
        href,
        description:
            'The ymm registers and the AVX, AVX2, FMA and BMI instructions: which run here, how they treat the upper half of a register, which cross between 128-bit lanes, and how memory operands are sized and aligned.',
        entries: proseEntries({
            language: 'x86',
            chapter: 'vector-instructions',
            chapterHref: href,
            markdown: vectorProse,
            openingTitle: 'Vector instructions'
        })
    }
}

/**
 * Running a program built outside the editor: an **Executable**, shown in the **Hex editor** and
 * as its **Listing** ([binary-import.md](../../../../../../docs/design/binary-import.md),
 * [file-views.md](../../../../../../docs/design/file-views.md)), and the **Build output**, the
 * program an x86 Build links, which opens like one.
 */
function executables(): Chapter {
    const href = `${BASE}/executables`
    return {
        id: 'executables',
        language: 'x86',
        title: 'Executables',
        href,
        description:
            'Import and debug an x86-64 Linux executable, read and edit its bytes, inspect its Listing, patch instructions during a paused run, and open the program a Build links.',
        entries: proseEntries({
            language: 'x86',
            chapter: 'executables',
            chapterHref: href,
            markdown: executablesProse,
            openingTitle: 'Running an Executable'
        })
    }
}

/** The C library a Build links when the Project or its Compilation asks for it. */
function runtimeLibrary(): Chapter {
    const href = `${BASE}/runtime-library`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language: 'x86',
            chapter: 'runtime-library',
            chapterHref: href,
            markdown: runtimeProse
        }),
        ...(runtimeFunctions as RuntimeFunctionList).functions.map((entry): DocumentationEntry => {
            const convention = x86CallingConvention(entry.prototype)
            const doc = runtimeFunctionDocumentation(entry.name, entry.doc)
            return {
                id: `x86/runtime-library/${entry.name}`,
                language: 'x86',
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
                        ...(convention ? [{ label: 'From assembly', value: convention }] : [])
                    ],
                    example: `call ${entry.name}`
                },
                searchText: `${entry.prototype}. ${doc}`
            }
        })
    ]
    return {
        id: 'runtime-library',
        language: 'x86',
        title: 'Runtime library',
        href,
        description:
            'The editor Runtime functions for compiled C/C++ and assembly programs that link Runtime ABI v1.',
        entries
    }
}

let cached: Chapter[] | null = null

/** The x86 Documentation's Chapters, in the order the complete documentation page has them. */
export function chapters(): Chapter[] {
    cached ??= [
        instructions(),
        extensions(),
        directives(),
        registersAndFlags(),
        vectorInstructions(),
        syscalls(),
        usingC(),
        runtimeLibrary(),
        executables()
    ]
    return cached
}
