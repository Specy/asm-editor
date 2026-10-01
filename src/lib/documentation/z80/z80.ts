import {
    formatZ80InstructionSummary,
    groupZ80VariantsByDescription,
    z80ConditionCodes,
    z80Directives,
    z80InstructionEntries,
    z80Operands,
    z80Registers,
    type Z80InstructionVariant
} from '$lib/languages/Z80/Z80-documentation'
import {
    Z80_COLORS,
    Z80_FLAGS,
    Z80_MOUSE_VIEWS,
    Z80_PORT_DOCS,
    Z80_PORT_GROUP_DOCS,
    Z80_PORTS,
    Z80_SCREEN_COMMAND_DOCS,
    type Z80PortDoc,
    type Z80PortGroup
} from '$lib/languages/Z80/Z80-model'
import { TRS80_KEY_ROW_DOCS, TRS80_MEMORY_DOCS } from '$lib/languages/Z80/trs80/trs80Display'
import {
    fillPlaceholders,
    names,
    proseEntries,
    summaryOf,
    type Chapter,
    type DocumentationEntry,
    type EntryField,
    type EntrySwatch
} from '../entries'
import directivesProse from './directives.md?raw'
import ioProse from './io.md?raw'
import registersProse from './registers.md?raw'

/**
 * The Z80 Documentation. A Z80 has no system calls, so where the other languages have syscalls or
 * trap tasks it has the port map, and its entries come from the same tables the emulator, the
 * hover and the coding agent's prompt read (`Z80-model.ts`, `trs80Display.ts`). Only the prose that
 * no data module holds lives here, as markdown.
 */

const BASE = '/documentation/z80'

type EntryContent = Omit<DocumentationEntry, 'id' | 'language' | 'chapter' | 'href' | 'anchor'>

/** An entry shown on its Chapter's page, at `anchor`. */
function entryAt(
    chapter: string,
    chapterHref: string,
    anchor: string,
    content: EntryContent
): DocumentationEntry {
    return {
        id: `z80/${chapter}/${anchor}`,
        language: 'z80',
        chapter,
        href: `${chapterHref}#${anchor}`,
        anchor,
        ...content
    }
}

/** An entry's summary: `summaryOf`, which reads past an "e.g." or an "i.e.". */
const summary = summaryOf

/** `af'` → `af-alternate`, `(ix+dd)` → `ix-dd`, `LINE_TO` → `line-to`: a name as part of an id. */
function slug(name: string): string {
    return name
        .toLowerCase()
        .replace(/'/g, '-alternate')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

/**
 * A Chapter's prose sections by anchor, so that each one can go before the entries it introduces.
 */
function sectionsOf(entries: DocumentationEntry[]): (anchor: string) => DocumentationEntry {
    const byAnchor = new Map(entries.map((entry) => [entry.anchor, entry]))
    return (anchor) => {
        const entry = byAnchor.get(anchor)
        if (!entry) throw new Error(`The Z80 prose has no section #${anchor}`)
        return entry
    }
}

/** How much of an instruction's forms its row shows; `ld` alone has 20 of them. */
const SIGNATURE_LENGTH = 60

/**
 * The first forms of `formatZ80InstructionSummary`, whole, as many as fit in a row:
 * `ld rr,nnnn | ld (rr),r | ld r,nn | …`. An instruction without operands gets none, since its one
 * form is its own name.
 */
function instructionSignature(
    mnemonic: string,
    variants: Z80InstructionVariant[]
): string | undefined {
    const forms = formatZ80InstructionSummary(variants).split(' | ')
    if (forms.length === 1 && forms[0] === mnemonic) return undefined
    let signature = forms[0]
    for (const form of forms.slice(1)) {
        if (signature.length + form.length + 3 > SIGNATURE_LENGTH) return `${signature} | …`
        signature += ` | ${form}`
    }
    return signature
}

function instructions(): Chapter {
    const entries = z80InstructionEntries.map(([mnemonic, variants]): DocumentationEntry => {
        const descriptions = groupZ80VariantsByDescription(variants)
            .map((group) => group.description)
            .filter(Boolean)
        return {
            id: `z80/instructions/${mnemonic}`,
            language: 'z80',
            chapter: 'instructions',
            kind: 'instruction',
            title: mnemonic,
            names: names(mnemonic),
            signature: instructionSignature(mnemonic, variants),
            //the plainest form comes first, and the instruction's page leads with it too
            summary: summary(descriptions[0] ?? mnemonic),
            href: `${BASE}/instruction/${mnemonic}`,
            anchor: mnemonic,
            view: { type: 'z80-instruction', variants },
            searchText: descriptions.join('\n'),
            code: [...new Set(variants.map((variant) => variant.instruction))].join('\n')
        }
    })
    return {
        id: 'instructions',
        language: 'z80',
        title: 'Instructions',
        href: `${BASE}/instruction`,
        description:
            'Every mnemonic with its operand forms, the flags it changes, its size in bytes and its clock cycles.',
        entries
    }
}

function directives(): Chapter {
    const href = `${BASE}/directive`
    const entries: DocumentationEntry[] = [
        ...proseEntries({
            language: 'z80',
            chapter: 'directives',
            chapterHref: href,
            markdown: directivesProse
        }),
        ...z80Directives.map((directive) => {
            const others = directive.names.slice(1)
            //`#include` → `include`: an id reads better without the sigil
            return entryAt('directives', href, directive.primary.replace(/^[.#]/, ''), {
                kind: 'directive',
                title: directive.primary,
                names: names(...directive.names),
                //the other spellings, so that a row found by `db` shows why it matched
                signature: others.length > 0 ? others.join(', ') : undefined,
                summary: summary(directive.description),
                view: { type: 'markdown', markdown: directive.description },
                searchText: [directive.description, ...directive.names].join('\n')
            })
        })
    ]
    return {
        id: 'directives',
        language: 'z80',
        title: 'Directives',
        href,
        description:
            'Placing code in memory, defining data and constants, including files and expanding macros.',
        entries
    }
}

/** What an undocumented register's signature means, said in its text. */
const UNDOCUMENTED =
    "**Undocumented**: not in Zilog's manual, but implemented by the hardware and by this emulator."

function registersAndFlags(): Chapter {
    const chapter = 'registers-and-flags'
    const href = `${BASE}/registers`
    const section = sectionsOf(
        proseEntries({ language: 'z80', chapter, chapterHref: href, markdown: registersProse })
    )
    const registers = z80Registers.map((register) => {
        const markdown = register.undocumented
            ? `${register.description}\n\n${UNDOCUMENTED}`
            : register.description
        return entryAt(chapter, href, `register-${slug(register.name)}`, {
            kind: 'register',
            title: register.name,
            names: names(register.name),
            signature: `${register.bits} bit${register.undocumented ? ', undocumented' : ''}`,
            summary: summary(register.description),
            view: { type: 'markdown', markdown },
            searchText: `${register.bits} bit register. ${markdown}`
        })
    })
    const flags = Z80_FLAGS.map((flag) => {
        //"Half carry: carry from bit 3…" is found as `half carry flag` too
        const meaning = /^([^:]+):/.exec(flag.description)?.[1]
        return entryAt(chapter, href, `flag-${slug(flag.name)}`, {
            kind: 'flag',
            title: flag.name,
            names: names(flag.name, `${flag.name} flag`, meaning && `${meaning} flag`),
            signature: `bit ${flag.bit}`,
            summary: summary(flag.description),
            view: { type: 'markdown', markdown: flag.description },
            searchText: `The ${flag.name} flag, bit ${flag.bit} of F. ${flag.description}`
        })
    })
    const conditions = z80ConditionCodes.map((condition) =>
        entryAt(chapter, href, `condition-${slug(condition.name)}`, {
            kind: 'condition-code',
            title: condition.name,
            names: names(condition.name),
            summary: summary(condition.description),
            view: { type: 'markdown', markdown: condition.description },
            searchText: `Condition code ${condition.name}. ${condition.description}`
        })
    )
    //what an operand of the instruction tables may be, which is what an addressing mode is
    const operands = z80Operands.map((operand) =>
        entryAt(chapter, href, `operand-${slug(operand.name)}`, {
            kind: 'addressing-mode',
            codeName: true,
            title: operand.name,
            names: names(operand.name),
            summary: summary(operand.description),
            view: { type: 'markdown', markdown: operand.description },
            searchText: `Operand placeholder ${operand.name}. ${operand.description}`
        })
    )
    return {
        id: chapter,
        language: 'z80',
        title: 'Registers & Flags',
        href,
        description:
            'The registers, the six flags of F, the condition codes and the operand placeholders.',
        entries: [
            section('registers'),
            ...registers,
            section('flags'),
            ...flags,
            section('condition-codes'),
            ...conditions,
            section('operands'),
            ...operands
        ]
    }
}

/** `0x2A`: a port or a color byte, the way the page and the examples write them. */
function toHex(byte: number): string {
    return `0x${byte.toString(16).padStart(2, '0').toUpperCase()}`
}

/**
 * The CSS color of a 3-3-2 color byte. Each field is stretched to eight bits by repeating it, which
 * is what the emulator does, so a swatch shows the color the program will actually get.
 */
function cssColor(color: number): string {
    const red = (color >> 5) & 0x07
    const green = (color >> 2) & 0x07
    const blue = color & 0x03
    const stretch = (value: number) => ((value << 5) | (value << 2) | (value >> 1)) & 0xff
    return `rgb(${stretch(red)}, ${stretch(green)}, ${blue * 0x55})`
}

function table(header: [string, string], rows: [string, string][]): string {
    const cell = (text: string) => text.replace(/\|/g, '\\|')
    return [
        `| ${header[0]} | ${header[1]} |`,
        '| --- | --- |',
        ...rows.map(([first, second]) => `| ${cell(first)} | ${cell(second)} |`)
    ].join('\n')
}

/**
 * What each mouse view answers with, keyed by the view's name so that a new view cannot go
 * undescribed.
 */
const MOUSE_VIEW_DESCRIPTIONS: Record<keyof typeof Z80_MOUSE_VIEWS, string> = {
    CURRENT: 'the pointer and the buttons right now',
    LAST_UP: 'the state at the last button release',
    LAST_DOWN: 'the state at the last button press, with the double-click flag'
}

/** The I/O prose, with its tables built from the data the emulator and the agent's prompt read. */
function ioMarkdown(): string {
    const views = Object.entries(Z80_MOUSE_VIEWS) as [keyof typeof Z80_MOUSE_VIEWS, number][]
    return fillPlaceholders(ioProse, {
        memory: table(
            ['Addresses', 'Contents'],
            TRS80_MEMORY_DOCS.map((row) => [
                `\`${row.range}\``,
                `**${row.title}.** ${row.description}`
            ])
        ),
        keys: table(
            ['Keyboard row', 'Keys'],
            TRS80_KEY_ROW_DOCS.map((keys, row) => [String(row), keys])
        ),
        views: table(
            ['B', 'View'],
            views.map(([name, view]) => [`\`${view}\``, MOUSE_VIEW_DESCRIPTIONS[name]])
        )
    })
}

function groupEntry(group: (typeof Z80_PORT_GROUP_DOCS)[number], href: string): DocumentationEntry {
    return entryAt('input-output', href, group.group, {
        kind: 'prose',
        title: group.title,
        names: [],
        signature: group.range,
        summary: summary(group.description),
        view: { type: 'markdown', markdown: group.description },
        searchText: group.description
    })
}

function portEntry(port: Z80PortDoc, href: string): DocumentationEntry {
    const number = toHex(port.port)
    const fields: EntryField[] = [
        { label: 'out', value: port.write },
        { label: 'in', value: port.read }
    ]
    //what running the example takes and gives, shown under it
    const after: EntryField[] = []
    if (port.example) {
        if (port.exampleInput) {
            const input = port.exampleInput.map((line) => `\`${line}\``).join(' ')
            after.push({ label: 'input', value: input })
        }
        const output = port.exampleOutput?.trimEnd()
        if (output) after.push({ label: 'prints', value: `\`${output}\`` })
        if (port.exampleShows) after.push({ label: 'shows', value: port.exampleShows })
    }
    //most ports past the console are only read, and their read side is what they are for
    const purpose = /^Ignored\b/.test(port.write) ? port.read : port.write
    return entryAt('input-output', href, port.name.toLowerCase(), {
        kind: 'port',
        title: port.title,
        names: names(port.name, port.title, `port ${number}`),
        signature: `port ${number}`,
        summary: summary(purpose),
        view: { type: 'fields', fields, example: port.example, after },
        searchText: [`Port ${number}.`, `Out: ${port.write}`, `In: ${port.read}`, port.exampleShows]
            .filter(Boolean)
            .join('\n'),
        code: port.example
    })
}

function commandEntry(
    command: (typeof Z80_SCREEN_COMMAND_DOCS)[number],
    href: string
): DocumentationEntry {
    //`RECTANGLE_OUTLINE` → "Rectangle outline": the data names a command only by its constant
    const words = command.name.toLowerCase().replace(/_/g, ' ')
    const title = words.charAt(0).toUpperCase() + words.slice(1)
    const port = toHex(Z80_PORTS.SCREEN_COMMAND)
    return entryAt('input-output', href, `command-${slug(command.name)}`, {
        kind: 'screen-command',
        title,
        names: names(words, command.name, `command ${command.command}`),
        signature: `command ${command.command}`,
        summary: summary(command.description),
        view: { type: 'markdown', markdown: command.description },
        searchText: `Screen command ${command.command}, written to port ${port}. ${command.description}`
    })
}

function colorsEntry(section: DocumentationEntry): DocumentationEntry {
    const swatches: EntrySwatch[] = Object.entries(Z80_COLORS).map(([name, color]) => ({
        name: name.toLowerCase().replace(/_/g, ' '),
        color: cssColor(color),
        value: toHex(color)
    }))
    const markdown = section.view.type === 'markdown' ? section.view.markdown : undefined
    //"orange" and "0xF0" find the colors too
    const named = swatches.map((swatch) => `${swatch.name} ${swatch.value}`).join(', ')
    return {
        ...section,
        view: { type: 'swatches', markdown, swatches },
        searchText: `${section.searchText}\n${named}`
    }
}

function inputOutput(): Chapter {
    const href = `${BASE}/io`
    const section = sectionsOf(
        proseEntries({
            language: 'z80',
            chapter: 'input-output',
            chapterHref: href,
            markdown: ioMarkdown()
        })
    )
    //what comes between a group's introduction and its ports
    const between: Partial<Record<Z80PortGroup, DocumentationEntry[]>> = {
        screen: [
            section('screen-commands'),
            ...Z80_SCREEN_COMMAND_DOCS.map((command) => commandEntry(command, href)),
            section('the-trs-80-display'),
            colorsEntry(section('colors'))
        ],
        mouse: [section('mouse-views')]
    }
    return {
        id: 'input-output',
        language: 'z80',
        title: 'Input/Output',
        href,
        description:
            'The ports that connect a program to the terminal, the Screen, the keyboard, the mouse and the clock.',
        entries: [
            section('ports'),
            ...Z80_PORT_GROUP_DOCS.flatMap((group) => [
                groupEntry(group, href),
                ...(between[group.group] ?? []),
                ...Z80_PORT_DOCS.filter((port) => port.group === group.group).map((port) =>
                    portEntry(port, href)
                )
            ])
        ]
    }
}

let cached: Chapter[] | null = null

export function chapters(): Chapter[] {
    cached ??= [instructions(), directives(), registersAndFlags(), inputOutput()]
    return cached
}
