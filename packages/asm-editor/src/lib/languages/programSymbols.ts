import type { MemoryLayout } from './commonLanguageFeatures.svelte'
import { loadedDemangler } from './demangle/loadDemangler'
import { splitAssemblyComment } from './service/assemblyText'
import { resolveProjectInclude, type BuildSources } from '#lib/projectFiles.ts'

/**
 * The labels and strings of a Debug session's program, as the Symbols panel lists them for a
 * program the editor built ([workbench.md](../../../../../docs/design/workbench.md), Symbols in
 * every Target): read once, as the Build loaded the program, before any of it ran.
 */

/** A label as a Core reports it, with as much of its definition as the Core knows. */
export type CoreLabel = {
    name: string
    address: bigint
    /** The File that defines it, when the Core says. */
    file?: string
    /** The 0-based line of its definition in `file`, when the Core says. */
    line?: number
    fromLibrary: boolean
}

/** Where a label is defined: a File of the Build and a 0-based line. */
export type LabelDefinition = { file: string; line: number }

export type ProgramLabel = {
    name: string
    /** What its row shows: a C++ name demangled, else its name. */
    display: string
    address: bigint
    /** Code when it is in a run of instructions, else data. */
    kind: 'code' | 'data'
    /** In bytes, up to the next label listed or the end of its run; 0 outside any run. */
    size: bigint
    /** Where it is defined, when the Core or the source says. */
    definition?: LabelDefinition
}

export type ProgramString = {
    /** The label it starts at. */
    label: string
    /** Its text up to the NUL, or up to the next label for one written without a NUL. */
    text: string
    /** The text as a C string literal's contents, control characters escaped. */
    escaped: string
    address: bigint
    definition?: LabelDefinition
}

export type ProgramSymbols = {
    /** The program's own labels, in address order. */
    labels: ProgramLabel[]
    /** The text its data labels start with, in address order. */
    strings: ProgramString[]
}

/** How a Target's assembly defines a label, for a label the Core gives no line for. */
export type LabelSyntax = {
    comment: '#' | ';'
    /** NASM: a label may go without its colon before data (`msg db "Hi", 0`). */
    colonless?: boolean
}

export type ProgramSymbolsInput = {
    labels: readonly CoreLabel[]
    /** The Build's memory layout, whose runs say which labels are code and how far each goes. */
    sections: MemoryLayout['sections']
    sources: BuildSources
    syntax: LabelSyntax
    /** The File and line of the instruction at an address. */
    locate: (address: bigint) => LabelDefinition | null
    read: (address: bigint, length: bigint) => Uint8Array
}

/** The labels a compiler makes for its own jumps and constants, `.L3`, `.LC0`, `$L5`, `.LBB0_2`. */
const COMPILER_LOCAL = /^(?:\.L|\$L)/
/** The most of a string read; its tooltip has all of it, its row the start. */
const MAX_STRING = 4096n
const CHUNK = 64n

export function programSymbols(input: ProgramSymbolsInput): ProgramSymbols {
    const { sources, syntax } = input
    const sorted = [...input.labels].sort((a, b) =>
        a.address < b.address ? -1 : a.address > b.address ? 1 : a.name.localeCompare(b.name)
    )
    const own = sorted.filter((label) => !label.fromLibrary)
    const runs = input.sections.flatMap((section) => section.runs)
    const runAt = (address: bigint) =>
        runs.find((run) => address >= run.start && address < run.start + run.length)
    const compiled = (label: CoreLabel) =>
        label.file !== undefined && !!sources.compiledLanguages?.[label.file]
    const demangler = loadedDemangler()
    const kindOf = (label: CoreLabel) => (runAt(label.address)?.kind === 'code' ? 'code' : 'data')
    const source = new SourceIndex(sources, syntax)
    const definitionOf = (label: CoreLabel): LabelDefinition | undefined => {
        if (label.file !== undefined && label.line !== undefined && label.line >= 0)
            return { file: label.file, line: label.line }
        if (kindOf(label) === 'code') {
            const at = input.locate(label.address)
            if (at && at.line >= 0) {
                //the label's own line, at or above its first instruction's
                const names = spellings(label.name, syntax)
                const own = source.definitionLine(at.file, names, at.line)
                return { file: at.file, line: own ?? at.line }
            }
        }
        return findDefinition(source, label, syntax)
    }

    const listed = own.filter((label) => !(compiled(label) && COMPILER_LOCAL.test(label.name)))
    const isListed = new Set(listed)
    //the first label listed at each address
    const listedAt = new Map<bigint, CoreLabel>()
    for (const label of listed) if (!listedAt.has(label.address)) listedAt.set(label.address, label)
    //where a label listed ends: at the next one, or at a library's, whose labels are not listed
    //but whose code or data starts there
    const ends = sorted
        .filter((label) => isListed.has(label) || label.fromLibrary)
        .map((label) => label.address)
    const labels = listed.map((label): ProgramLabel => {
        const run = runAt(label.address)
        const next = firstAbove(ends, label.address)
        const runEnd = run ? run.start + run.length : label.address
        const end = next !== undefined && next < runEnd ? next : runEnd
        const display = (compiled(label) && demangler?.describe(label.name)?.text) || label.name
        const definition = definitionOf(label)
        return {
            name: label.name,
            display,
            address: label.address,
            kind: kindOf(label),
            size: end - label.address,
            ...(definition ? { definition } : {})
        }
    })

    //a compiler's string constants are no labels to list, but they are its strings
    const strings: ProgramString[] = []
    const seen = new Set<bigint>()
    const starts = sorted.map((label) => label.address)
    for (const label of own) {
        if (seen.has(label.address) || kindOf(label) === 'code') continue
        seen.add(label.address)
        const run = runAt(label.address)
        if (!run) continue
        const next = firstAbove(starts, label.address)
        let end = run.start + run.length
        if (next !== undefined && next < end) end = next
        if (end - label.address > MAX_STRING) end = label.address + MAX_STRING
        const text = textAt(input.read, label.address, end)
        if (text === undefined) continue
        //a label listed that names it, when the first at its address is not
        const named = isListed.has(label) ? label : (listedAt.get(label.address) ?? label)
        const definition = definitionOf(named)
        strings.push({
            label: named.name,
            text,
            escaped: escapeText(text),
            address: label.address,
            ...(definition ? { definition } : {})
        })
    }
    return { labels, strings }
}

/** The first of ascending addresses above `address`. */
function firstAbove(addresses: readonly bigint[], address: bigint): bigint | undefined {
    let low = 0
    let high = addresses.length
    while (low < high) {
        const middle = (low + high) >> 1
        if (addresses[middle] <= address) low = middle + 1
        else high = middle
    }
    return addresses[low]
}

/** Bytes a string may hold besides printable ones: tab, line breaks, bell, backspace and escape. */
function isTextByte(byte: number): boolean {
    return (byte >= 0x20 && byte !== 0x7f) || (byte >= 0x07 && byte <= 0x0d) || byte === 0x1b
}

/**
 * The text at `start`, read up to a NUL or to `end`, the next label or the end of its run: none
 * when it holds a byte no text does, is not UTF-8, or has fewer than two characters or no visible
 * one, which a number stored there would.
 */
function textAt(read: ProgramSymbolsInput['read'], start: bigint, end: bigint): string | undefined {
    const bytes: number[] = []
    try {
        reading: for (let at = start; at < end;) {
            const chunk = read(at, end - at < CHUNK ? end - at : CHUNK)
            if (!chunk.length) break
            for (const byte of chunk) {
                if (byte === 0) break reading
                if (!isTextByte(byte)) return undefined
                bytes.push(byte)
            }
            at += BigInt(chunk.length)
        }
    } catch {
        return undefined
    }
    let text: string
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
    } catch {
        return undefined
    }
    const characters = [...text]
    //one that shows: no space, line break or other control character
    const visible = characters.some((char) => char.codePointAt(0)! > 0x20 && !/\s/.test(char))
    return characters.length >= 2 && visible ? text : undefined
}

/** Text as a C string literal's contents: `\n`, `\t`, `\r`, `\"`, `\\`, other controls as `\xNN`. */
export function escapeText(text: string): string {
    let out = ''
    for (const char of text) {
        const code = char.codePointAt(0)!
        if (char === '\n') out += '\\n'
        else if (char === '\t') out += '\\t'
        else if (char === '\r') out += '\\r'
        else if (char === '"' || char === '\\') out += `\\${char}`
        else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`
        else out += char
    }
    return out
}

const IDENTIFIER = /^([A-Za-z_.$@?~][\w.$@?~#]*)/
/** What follows a NASM label written without its colon. */
const NASM_DATA = /^(?:d[bwdqtoyz]|res[bwdqtoyz]|times|equ|incbin|istruc)\b/i

/**
 * How the source may write a label the Core names: as it is, and a NASM local label, which NASM
 * names after the label above it, `main.loop`, also as it is written there, `.loop`.
 */
function spellings(name: string, syntax: LabelSyntax): string[] {
    const dot = name.indexOf('.', 1)
    return syntax.colonless && dot > 0 ? [name, name.slice(dot)] : [name]
}

/**
 * The labels a line's code defines: `name:`, after other labels too, and NASM's `name db`.
 */
function labelsDefined(code: string, syntax: LabelSyntax): string[] {
    const names: string[] = []
    let rest = code.trimStart()
    for (;;) {
        const label = IDENTIFIER.exec(rest)
        if (!label) return names
        const after = rest.slice(label[0].length).trimStart()
        if (after.startsWith(':')) {
            names.push(label[1])
            rest = after.slice(1).trimStart()
            continue
        }
        if (syntax.colonless && NASM_DATA.test(after)) names.push(label[1])
        return names
    }
}

const INCLUDE = /^\s*(?:\.include|%include|#include|include)\s+(["'])(.*?)\1/i

/**
 * The Build's source Files, each read once however many labels are looked up in it: the labels
 * every line defines, and the Files each one includes. A compiled program has thousands of labels
 * in tens of thousands of lines.
 */
class SourceIndex {
    /** Each label a File defines, and the 0-based lines that define it, in order. */
    private readonly definitions = new Map<string, Map<string, number[]> | null>()
    private readonly units = new Map<string, string[]>()
    private readonly code = new Map<string, string[] | null>()

    constructor(
        readonly sources: BuildSources,
        private readonly syntax: LabelSyntax
    ) {}

    /** A text File's lines without their comments; none for another File, or no File. */
    private codeOf(path: string): string[] | null {
        let lines = this.code.get(path)
        if (lines === undefined) {
            const file = this.sources.files[path]
            lines =
                file && file.encoding === 'plain'
                    ? file.content
                          .split(/\r?\n/)
                          .map((line) => splitAssemblyComment(line, this.syntax.comment).code)
                    : null
            this.code.set(path, lines)
        }
        return lines
    }

    private definitionsOf(path: string): Map<string, number[]> | null {
        let found = this.definitions.get(path)
        if (found === undefined) {
            const lines = this.codeOf(path)
            found = lines && new Map()
            lines?.forEach((code, line) => {
                for (const name of labelsDefined(code, this.syntax)) {
                    const at = found!.get(name)
                    if (at) at.push(line)
                    else found!.set(name, [line])
                }
            })
            this.definitions.set(path, found)
        }
        return found
    }

    /**
     * The line of a File that defines a label of one of those names, the first after `after`, or
     * with `before` the last at or above that line.
     */
    definitionLine(
        path: string,
        names: readonly string[],
        before?: number,
        after = -1
    ): number | undefined {
        const definitions = this.definitionsOf(path)
        if (!definitions) return undefined
        let best: number | undefined
        for (const name of names)
            for (const line of definitions.get(name) ?? []) {
                if (before !== undefined ? line > before : line <= after) continue
                if (best === undefined || (before !== undefined ? line > best : line < best))
                    best = line
            }
        return best
    }

    /** A File and the Files it includes, and theirs, in the order the assembler reads them. */
    unitFiles(path: string): string[] {
        let files = this.units.get(path)
        if (!files) {
            const found: string[] = []
            const visit = (path: string) => {
                const lines = found.includes(path) ? null : this.codeOf(path)
                if (!lines) return
                found.push(path)
                for (const code of lines) {
                    const written = INCLUDE.exec(code)?.[2]
                    const included = written && resolveProjectInclude(path, written, this.sources)
                    if (included) visit(included)
                }
            }
            visit(path)
            files = found
            this.units.set(path, files)
        }
        return files
    }
}

/**
 * Where the source defines a label: in its File, or a File that one includes, when the Core says
 * which, else in the Entry's, then the other Files. A NASM local label, `main.loop`, is `.loop`
 * below `main`.
 */
function findDefinition(
    source: SourceIndex,
    label: CoreLabel,
    syntax: LabelSyntax
): LabelDefinition | undefined {
    const { sources } = source
    const unit = source.unitFiles(label.file ?? sources.entry)
    const paths =
        label.file !== undefined
            ? unit
            : [...unit, ...Object.keys(sources.files).filter((path) => !unit.includes(path))]
    for (const path of paths) {
        const line = source.definitionLine(path, [label.name])
        if (line !== undefined) return { file: path, line }
    }
    const [, local] = spellings(label.name, syntax)
    if (local === undefined) return undefined
    const global = label.name.slice(0, label.name.length - local.length)
    for (const path of paths) {
        const parent = source.definitionLine(path, [global])
        if (parent === undefined) continue
        const line = source.definitionLine(path, [local], undefined, parent)
        if (line !== undefined) return { file: path, line }
    }
    return undefined
}
