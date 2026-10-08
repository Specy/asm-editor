import {
    branchConditions,
    branchConditionsDescriptions,
    branchConditionsFlags,
    directions,
    directionsDescriptions,
    fromSizesToString,
    instructionsDocumentationList,
    M68KDirectiveDocumentationList,
    type Size
} from '$lib/languages/M68K/M68K-documentation'
import {
    M68K_COLORS,
    M68K_KEY_CODE_DOCS,
    M68K_KEY_CODE_RULES,
    M68K_REJECTED_TRAP_TASKS,
    M68K_TRAP_DOCS,
    M68K_TRAP_GROUP_DOCS,
    type M68KTrapDoc,
    type M68KTrapGroup
} from '$lib/languages/M68K/M68K-traps'
import {
    fillPlaceholders,
    names,
    proseEntries,
    summaryOf,
    type Chapter,
    type DocumentationEntry,
    type EntryField,
    type EntryKind,
    type EntrySwatch
} from '../entries'
import addressingModesMarkdown from './addressing-modes.md?raw'
import assemblerFeaturesMarkdown from './assembler-features.md?raw'
import conditionCodesMarkdown from './condition-codes.md?raw'
import exceptionsMarkdown from './exceptions.md?raw'
import shiftDirectionsMarkdown from './shift-directions.md?raw'
import trapsMarkdown from './traps.md?raw'

/**
 * The M68K Documentation. Instructions, directives, condition codes and trap tasks come from the
 * same tables the editor's hovers and the agent's prompt read; the explanations around them are the
 * markdown files beside this one, and the lists and tables inside those are filled in from the
 * tables too, so the text cannot drift from what the editor does.
 */

const BASE = '/documentation/m68k'

/** The sizes an instruction or a directive takes, as the row shows them: `b, w, l`. */
function sizesOf(sizes: Size[]): string | undefined {
    return sizes.length > 0 ? fromSizesToString(sizes) : undefined
}

/**
 * A markdown file's sections as entries. The summary skips a quote's `>`, which `summaryOf` keeps:
 * the Exceptions open with a callout, and its first sentence is the one line a row should show.
 */
function prose(
    chapter: string,
    chapterHref: string,
    markdown: string,
    kind?: EntryKind
): DocumentationEntry[] {
    return proseEntries({ language: 'm68k', chapter, chapterHref, markdown, kind }).map(
        (entry) => ({ ...entry, summary: summaryOf(entry.searchText.replace(/^\s*>\s?/gm, '')) })
    )
}

function instructions(): Chapter {
    const href = `${BASE}/instruction`
    const entries = instructionsDocumentationList.map((instruction): DocumentationEntry => ({
        id: `m68k/instructions/${instruction.name}`,
        language: 'm68k',
        chapter: 'instructions',
        kind: 'instruction',
        title: instruction.name,
        //a family is one entry named by every mnemonic it stands for, so `beq` finds Bcc
        names: names(instruction.name, ...(instruction.compundNames ?? [])),
        signature: sizesOf(instruction.sizes),
        summary: summaryOf(instruction.description),
        href: `${href}/${instruction.name}`,
        anchor: instruction.name,
        view: { type: 'm68k-instruction', instruction },
        searchText: instruction.description,
        code: instruction.example
    }))
    return {
        id: 'instructions',
        language: 'm68k',
        title: 'Instructions',
        href,
        description:
            'Every instruction the assembler accepts, with its sizes and the addressing modes of its operands.',
        entries
    }
}

/**
 * Each addressing mode as the instructions' operand lists write it, by its anchor in
 * addressing-modes.md: the row's signature, and the spellings an exact search finds it by.
 */
const ADDRESSING_MODE_SYNTAX: Record<string, string[]> = {
    direct: ['Dn', 'An'],
    indirect: ['(An)'],
    'address-register-displacement': ['d(An)'],
    'indirect-post-pre-increment': ['(An)+', '-(An)'],
    immediate: ['Im', '#<num>'],
    'effective-address': ['Ea/<label>', '<ea>'],
    'address-register-indexed': ['d(An,Xn)'],
    'program-counter-relative': ['d(PC)', 'd(PC,Xn)'],
    'status-registers': ['sr', 'ccr']
}

function addressingModes(): Chapter {
    const href = `${BASE}/addressing-mode`
    const entries = prose('addressing-modes', href, addressingModesMarkdown, 'addressing-mode').map(
        (entry): DocumentationEntry => {
            const syntax = ADDRESSING_MODE_SYNTAX[entry.anchor] ?? []
            return { ...entry, names: names(...syntax), signature: syntax.join(', ') || undefined }
        }
    )
    return {
        id: 'addressing-modes',
        language: 'm68k',
        title: 'Addressing modes',
        href,
        description: 'The ways an operand names a register, a value or a place in memory.',
        entries
    }
}

function conditionCodes(): Chapter {
    const href = `${BASE}/condition-codes`
    const codes = branchConditions.map((code): DocumentationEntry => {
        const description = `${branchConditionsDescriptions.get(code) ?? code}.`
        //the three instructions that test it, which the explanation names only as families
        const [branch, loop, set] = [`b${code}`, `db${code}`, `s${code}`].map(
            (name) => `[${name}](${BASE}/instruction/${name})`
        )
        const markdown = `${description}\n\nUsed by ${branch}, ${loop} and ${set}.`
        return {
            id: `m68k/condition-codes/${code}`,
            language: 'm68k',
            chapter: 'condition-codes',
            kind: 'condition-code',
            title: code,
            names: names(code),
            signature: branchConditionsFlags.get(code),
            summary: description,
            href: `${href}#${code}`,
            anchor: code,
            view: { type: 'markdown', markdown },
            searchText: markdown
        }
    })
    return {
        id: 'condition-codes',
        language: 'm68k',
        title: 'Condition codes',
        href,
        description:
            'The flags an instruction leaves in the status register, and the conditions that branches, sets and loops test.',
        entries: [...prose('condition-codes', href, conditionCodesMarkdown), ...codes]
    }
}

function shiftDirections(): Chapter {
    const href = `${BASE}/shift-direction`
    const markdown = fillPlaceholders(shiftDirectionsMarkdown, {
        directions: directions
            .map((direction) => `- \`${direction}\`: ${directionsDescriptions.get(direction)}`)
            .join('\n')
    })
    return {
        id: 'shift-directions',
        language: 'm68k',
        title: 'Shift directions',
        href,
        description: 'Which way the shift and rotate instructions move the bits.',
        entries: prose('shift-directions', href, markdown)
    }
}

/** A `$00BBGGRR` equate as CSS, which wants the channels the other way round. */
function cssColor(color: number): string {
    return `rgb(${color & 0xff}, ${(color >> 8) & 0xff}, ${(color >> 16) & 0xff})`
}

function hexByte(code: number): string {
    return `$${code.toString(16).padStart(2, '0').toUpperCase()}`
}

/** The colors section of traps.md, with the assembly equates as swatches under its text. */
function withSwatches(section: DocumentationEntry): DocumentationEntry {
    const markdown = section.view.type === 'markdown' ? section.view.markdown : ''
    const swatches = Object.entries(M68K_COLORS).map(([name, color]): EntrySwatch => ({
        name: name.toLowerCase(),
        color: cssColor(color),
        value: `$${color.toString(16).padStart(8, '0').toUpperCase()}`
    }))
    return {
        ...section,
        //a program names them, so `red` opens the colors
        names: names(...swatches.map((swatch) => swatch.name)),
        view: { type: 'swatches', markdown, swatches },
        searchText: [markdown, ...swatches.map((swatch) => `${swatch.name} ${swatch.value}`)].join(
            '\n'
        )
    }
}

function groupEntry(
    group: (typeof M68K_TRAP_GROUP_DOCS)[number],
    href: string
): DocumentationEntry {
    const tasks = M68K_TRAP_DOCS.filter((task) => task.group === group.group).map(
        (task) => task.task
    )
    return {
        id: `m68k/trap-tasks/${group.group}`,
        language: 'm68k',
        chapter: 'trap-tasks',
        kind: 'prose',
        title: group.title,
        names: [],
        signature:
            tasks.length > 0 ? `tasks ${Math.min(...tasks)} to ${Math.max(...tasks)}` : undefined,
        summary: summaryOf(group.description),
        href: `${href}#${group.group}`,
        anchor: group.group,
        view: { type: 'markdown', markdown: group.description },
        searchText: group.description
    }
}

function taskEntry(task: M68KTrapDoc, href: string): DocumentationEntry {
    const fields: EntryField[] = []
    if (task.input) fields.push({ label: 'In', value: task.input })
    if (task.output) fields.push({ label: 'Out', value: task.output })
    if (task.deviation) fields.push({ label: 'Note', value: task.deviation })
    return {
        id: `m68k/trap-tasks/task-${task.task}`,
        language: 'm68k',
        chapter: 'trap-tasks',
        kind: 'trap-task',
        title: task.title,
        names: names(
            `task ${task.task}`,
            `trap 15 task ${task.task}`,
            `trap #15 task ${task.task}`,
            task.title
        ),
        signature: `D0.B = ${task.task}`,
        summary: summaryOf(task.description),
        href: `${href}#task-${task.task}`,
        anchor: `task-${task.task}`,
        view: { type: 'fields', markdown: task.description, fields },
        searchText: [
            `Trap #15 task ${task.task}.`,
            task.description,
            task.input ? `In: ${task.input}.` : '',
            task.output ? `Out: ${task.output}.` : '',
            task.deviation ?? ''
        ]
            .filter(Boolean)
            .join(' ')
    }
}

/**
 * The tasks that are not supported, one line per reason: neighbouring tasks that share one, such as
 * the eight sound tasks, are listed together before it.
 */
function rejectedTaskList(): string {
    const lines: { tasks: string[]; reason: string }[] = []
    for (const task of M68K_REJECTED_TRAP_TASKS) {
        const named = `\`${task.task}\` ${task.title}`
        const last = lines[lines.length - 1]
        if (last?.reason === task.reason) last.tasks.push(named)
        else lines.push({ tasks: [named], reason: task.reason })
    }
    return lines.map((line) => `- ${line.tasks.join(', ')} — ${line.reason}`).join('\n')
}

/**
 * The Chapter in the page's order: the introduction, then each group of tasks after its own
 * introduction (the colors beside the graphics tasks, the key codes beside the keyboard ones), then
 * the tasks that are not supported.
 */
function trapTasks(): Chapter {
    const href = `${BASE}/traps`
    const markdown = fillPlaceholders(trapsMarkdown, {
        keyCodeRules: M68K_KEY_CODE_RULES.map((rule) => `- ${rule}`).join('\n'),
        keyCodes: [
            '| Key | Code |',
            '| --- | ---- |',
            ...M68K_KEY_CODE_DOCS.map((key) => `| ${key.name} | \`${hexByte(key.code)}\` |`)
        ].join('\n'),
        unsupportedTasks: rejectedTaskList()
    })
    const sections = new Map(
        prose('trap-tasks', href, markdown).map((entry) => [entry.anchor, entry])
    )
    const take = (anchor: string): DocumentationEntry[] => {
        const entry = sections.get(anchor)
        sections.delete(anchor)
        return entry ? [entry] : []
    }
    const beside: Partial<Record<M68KTrapGroup, DocumentationEntry[]>> = {
        graphics: take('colors').map(withSwatches),
        input: take('key-codes')
    }
    const closing = take('unsupported')
    const entries = [
        //what is left of traps.md introduces the whole Chapter
        ...sections.values(),
        ...M68K_TRAP_GROUP_DOCS.flatMap((group) => [
            groupEntry(group, href),
            ...(beside[group.group] ?? []),
            ...M68K_TRAP_DOCS.filter((task) => task.group === group.group).map((task) =>
                taskEntry(task, href)
            )
        ]),
        ...closing
    ]
    return {
        id: 'trap-tasks',
        language: 'm68k',
        title: 'Trap tasks',
        href,
        description:
            'The editor’s services use the 68000 `trap` instruction with vector 15. Put the task number in D0.B (the values below are decimal); the task’s other inputs and results use the listed registers. These simulator tasks are distinct from the CPU’s exception and interrupt handling.',
        entries
    }
}

function exceptions(): Chapter {
    const href = `${BASE}/exceptions`
    return {
        id: 'exceptions',
        language: 'm68k',
        title: 'Exceptions',
        href,
        description:
            'How a real 68000 handles exceptions, interrupts and traps, and what this editor does instead.',
        entries: prose('exceptions', href, exceptionsMarkdown)
    }
}

function directives(): Chapter {
    const href = `${BASE}/directive`
    const entries = M68KDirectiveDocumentationList.map((directive): DocumentationEntry => ({
        id: `m68k/directives/${directive.name}`,
        language: 'm68k',
        chapter: 'directives',
        kind: 'directive',
        title: directive.name,
        names: names(directive.name),
        signature: sizesOf(directive.sizes),
        summary: summaryOf(directive.description),
        href: `${href}#${directive.name}`,
        anchor: directive.name,
        view: {
            type: 'fields',
            markdown: directive.description,
            fields: [],
            example: directive.example
        },
        searchText: directive.description,
        code: directive.example
    }))
    return {
        id: 'directives',
        language: 'm68k',
        title: 'Directives',
        href,
        description:
            'What the assembler does before the program runs: data, space, constants, sections and other Files.',
        entries
    }
}

function assemblerFeatures(): Chapter {
    const href = `${BASE}/assembler-features`
    return {
        id: 'assembler-features',
        language: 'm68k',
        title: 'Assembler features',
        href,
        description: 'What the assembler works out for you, such as arithmetic in operands.',
        entries: prose('assembler-features', href, assemblerFeaturesMarkdown)
    }
}

let cached: Chapter[] | null = null

/** The M68K Documentation's Chapters. */
export function chapters(): Chapter[] {
    cached ??= [
        instructions(),
        addressingModes(),
        conditionCodes(),
        shiftDirections(),
        trapTasks(),
        exceptions(),
        directives(),
        assemblerFeatures()
    ]
    return cached
}
