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
    const definitionOf = (label: CoreLabel): LabelDefinition | undefined => {
        if (label.file !== undefined && label.line !== undefined && label.line >= 0)
            return { file: label.file, line: label.line }
        if (kindOf(label) === 'code') {
            const at = input.locate(label.address)
            if (at && at.line >= 0) {
                //the label's own line, at or above its first instruction's
                const names = spellings(label.name, syntax)
                const own = definitionLine(sources, at.file, names, syntax, at.line)
                return { file: at.file, line: own ?? at.line }
            }
        }
        return findDefinition(sources, label, syntax)
    }

    const listed = own.filter((label) => !(compiled(label) && COMPILER_LOCAL.test(label.name)))
    const isListed = new Set(listed)
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
        const named = isListed.has(label)
            ? label
            : (listed.find((other) => other.address === label.address) ?? label)
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
 * Whether a line's code defines a label of one of those names: `name:`, after other labels too, or
 * NASM's `name db`.
 */
function definesLabel(code: string, names: readonly string[], syntax: LabelSyntax): boolean {
    let rest = code.trimStart()
    for (;;) {
        const label = IDENTIFIER.exec(rest)
        if (!label) return false
        const after = rest.slice(label[0].length).trimStart()
        if (after.startsWith(':')) {
            if (names.includes(label[1])) return true
            rest = after.slice(1).trimStart()
            continue
        }
        return !!syntax.colonless && names.includes(label[1]) && NASM_DATA.test(after)
    }
}

/**
 * The line of a File that defines a label of one of those names, the first after `after`, or with
 * `before` the last at or above that line.
 */
function definitionLine(
    sources: BuildSources,
    path: string,
    names: readonly string[],
    syntax: LabelSyntax,
    before?: number,
    after = -1
): number | undefined {
    const file = sources.files[path]
    if (!file || file.encoding !== 'plain') return undefined
    const lines = file.content.split(/\r?\n/)
    const defines = (line: number) =>
        definesLabel(splitAssemblyComment(lines[line], syntax.comment).code, names, syntax)
    if (before !== undefined) {
        for (let line = Math.min(before, lines.length - 1); line >= 0; line--)
            if (defines(line)) return line
        return undefined
    }
    for (let line = after + 1; line < lines.length; line++) if (defines(line)) return line
    return undefined
}

const INCLUDE = /^\s*(?:\.include|%include|#include|include)\s+(["'])(.*?)\1/i

/** A File and the Files it includes, and theirs, in the order the assembler reads them. */
function unitFiles(sources: BuildSources, path: string, syntax: LabelSyntax): string[] {
    const files: string[] = []
    const visit = (path: string) => {
        const file = sources.files[path]
        if (files.includes(path) || !file || file.encoding !== 'plain') return
        files.push(path)
        for (const line of file.content.split(/\r?\n/)) {
            const written = INCLUDE.exec(splitAssemblyComment(line, syntax.comment).code)?.[2]
            const included = written && resolveProjectInclude(path, written, sources)
            if (included) visit(included)
        }
    }
    visit(path)
    return files
}

/**
 * Where the source defines a label: in its File, or a File that one includes, when the Core says
 * which, else in the Entry's, then the other Files. A NASM local label, `main.loop`, is `.loop`
 * below `main`.
 */
function findDefinition(
    sources: BuildSources,
    label: CoreLabel,
    syntax: LabelSyntax
): LabelDefinition | undefined {
    const unit = unitFiles(sources, label.file ?? sources.entry, syntax)
    const paths =
        label.file !== undefined
            ? unit
            : [...unit, ...Object.keys(sources.files).filter((path) => !unit.includes(path))]
    for (const path of paths) {
        const line = definitionLine(sources, path, [label.name], syntax)
        if (line !== undefined) return { file: path, line }
    }
    const [, local] = spellings(label.name, syntax)
    if (local === undefined) return undefined
    const global = label.name.slice(0, label.name.length - local.length)
    for (const path of paths) {
        const parent = definitionLine(sources, path, [global], syntax)
        if (parent === undefined) continue
        const line = definitionLine(sources, path, [local], syntax, undefined, parent)
        if (line !== undefined) return { file: path, line }
    }
    return undefined
}
