import { ARGUMENTS_DIAGNOSTIC_SOURCE } from '#lib/commandLine.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { fileText, type ProjectFile, type ProjectFiles } from '#lib/projectFiles.ts'
import { editorFileLanguage } from '#lib/sourceCompilation/records.ts'

/**
 * What the Workbench's Documentation panel favours
 * ([the design record](../../../../../docs/design/documentation-search.md), Searching in plain
 * English, The Problems panel): the instruction or directive that starts the line of each error in
 * an assembly File, after any label, in lowercase, once each and sorted, so that a new analysis
 * with the same errors gives the same list. Warnings, C and C++ Files and the Arguments' errors
 * give none, and neither do the messages, whose words differ across the five Cores. Which of these
 * words name an entry is the search engine's to tell: it ignores the others.
 *
 * `files` are the Files the Diagnostics are about, the live ones or, in the snapshot view, the
 * Build's own; a Diagnostic of no File is about `entry`, the Program's Entry file.
 */
export function favouredNames(
    diagnostics: readonly Diagnostic[],
    files: ProjectFiles,
    entry: string | undefined,
    language: AvailableLanguages
): string[] {
    const names = new Set<string>()
    const lines = new Map<string, string[] | undefined>()
    for (const diagnostic of diagnostics) {
        if (diagnostic.severity !== 'error') continue
        //typed on the Command line, not in a File
        if (diagnostic.source === ARGUMENTS_DIAGNOSTIC_SOURCE) continue
        const path = diagnostic.file ?? entry
        if (path === undefined || editorFileLanguage(path, language) !== language) continue
        if (!lines.has(path)) lines.set(path, linesOf(files[path]))
        const line = lines.get(path)?.[diagnostic.lineIndex]
        if (line === undefined) continue
        for (const name of statementNames(line, language)) names.add(name)
    }
    return [...names].sort()
}

function linesOf(file: ProjectFile | undefined): string[] | undefined {
    if (!file) return undefined
    try {
        return fileText(file).split(/\r?\n/)
    } catch {
        //bytes that are not text have no lines
        return undefined
    }
}

/**
 * The first word of a statement after its labels, in lowercase: `loop: addi $t0, $t0, 1` gives
 * `addi`. None for a line of no statement: a label alone, a comment, an empty line.
 *
 * A label is a word ending in `:`, and in M68K also a word in the first column (`FPS equ 30` has
 * the label `FPS`), unless it is the name of an instruction or a directive, as s68k and the
 * editor's grammar read it: `rts` in the first column is the instruction. A word with a size
 * suffix is never a label there (`move.l`); for any other word in the first column, this gives it
 * and the word after it, and the engine, which knows the names, keeps the one that is an entry's.
 * Z80 has a rule of its own (`z80Statement`).
 */
export function statementNames(line: string, language: AvailableLanguages): string[] {
    if (language === 'Z80') {
        const name = z80Statement(line)
        return name ? [name] : []
    }
    const first = language === 'M68K' ? /^[A-Za-z_][\w.]*(?=[\s;]|$)/.exec(line)?.[0] : undefined
    if (first) {
        if (/\.[bwls]$/i.test(first)) return [first.toLowerCase()]
        const next = operation(line.slice(first.length), true)
        return next ? [first.toLowerCase(), next] : [first.toLowerCase()]
    }
    const name = operation(line, false)
    return name ? [name] : []
}

/**
 * The statement's word of a Z80 line, as the Z80 assembler reads it. Any word in the first column
 * is a label, with its colons or without, a mnemonic too: `loop    djnz loop` gives `djnz`, and
 * `djnz loop` in the first column gives `loop`, which the assembler reports as an unknown mnemonic
 * and which names no entry. On an indented line the first word is the statement's, with a colon
 * after it or not (`    inner: djnz inner` is the unknown mnemonic `inner`). After a label the
 * word must end there, so an operand is never taken out of a list (`ld a,b` in the first column,
 * whose `a` the assembler does not take for a mnemonic).
 */
function z80Statement(line: string): string | undefined {
    const label = /^\.?[A-Za-z_]\w*(?:\s*::?)?/.exec(line)?.[0]
    const word =
        label === undefined
            ? /^\s*([#.]?[A-Za-z_]\w*)/.exec(line)
            : /^\s*(\.?[A-Za-z_]\w*)(?=[\s;]|$)/.exec(line.slice(label.length))
    return word?.[1].toLowerCase()
}

/**
 * The first word after any labels ending in `:`: a mnemonic or a directive (`.data`, `dc.w`, the
 * Z80's `#insert`), never a comment. `whole` asks for a word the line breaks after, so that the
 * operand of an instruction read as a label is not taken from a list (`move sr,d0`).
 */
function operation(text: string, whole: boolean): string | undefined {
    const rest = text.replace(/^\s*(?:[^\s:;#]+:(?!:)\s*)*/, '')
    const word = whole ? /^[.#]?[A-Za-z_][\w.]*(?=[\s;]|$)/ : /^[.#]?[A-Za-z_][\w.]*/
    return word.exec(rest)?.[0].toLowerCase()
}
