import type monaco from 'monaco-editor'
import type { DecompiledLine } from '@specy/decompiler'

/**
 * Keeping an editor on the same place of a function's Pseudocode when the function is decompiled
 * again ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 22): a comment adds lines above a statement, a rename makes a line longer or shorter,
 * an overwrite changes the code. The cursor, the selection and the first visible line move to the
 * line standing for the same thing (a statement by its instructions' addresses, a comment by the
 * address it is kept at, a declaration by the names it declares), and a cursor on a name to the
 * same name, whatever it is called now.
 */

/** A function's Pseudocode as an editor shows it: the decompiler's lines from document line `firstLine`. */
export type PseudocodeLines = {
    readonly lines: readonly DecompiledLine[]
    readonly firstLine: number
}

/** How far from a line standing for nothing (a brace, a blank) the one it moves with is looked for. */
const NEAREST_PLACE = 64

/**
 * What a decompiled line stands for, the same in another decompilation of the function: a
 * comment's line its kind and address, a statement the addresses of its instructions, a
 * declaration the variables and globals it names. Undefined for a line of syntax alone.
 */
function lineKey(line: DecompiledLine): string | undefined {
    const { tokens } = line
    if (!tokens.length) return undefined
    if (tokens.every((token) => token.kind === 'comment')) {
        const [first] = tokens
        return first.address === undefined ? undefined : `${first.comment}@${first.address}`
    }
    if (line.addresses.length) return `#${line.addresses.join(',')}`
    const named = tokens.flatMap((token) =>
        token.variable !== undefined
            ? [token.variable]
            : token.target !== undefined
              ? [`>${token.target}`]
              : []
    )
    return named.length ? `=${named.join(',')}` : undefined
}

/** Each line's key and how many lines before it have the same one, by document line. */
type Places = {
    keys: (string | undefined)[]
    nths: number[]
    /** The document line of each key's nth line. */
    lines: Map<string, number[]>
}

const placesOf = new WeakMap<readonly DecompiledLine[], Places>()

function places(text: PseudocodeLines): Places {
    let found = placesOf.get(text.lines)
    if (found) return found
    found = { keys: [], nths: [], lines: new Map() }
    for (let index = 0; index < text.lines.length; index++) {
        const key = lineKey(text.lines[index])
        found.keys.push(key)
        if (key === undefined) {
            found.nths.push(0)
            continue
        }
        let lines = found.lines.get(key)
        if (!lines) found.lines.set(key, (lines = []))
        found.nths.push(lines.length)
        lines.push(index + text.firstLine)
    }
    placesOf.set(text.lines, found)
    return found
}

/** The document line of `to` standing for what a decompiled line of `from` does, or -1. */
function lineOfKey(from: Places, to: Places, index: number): number {
    const key = from.keys[index]
    if (key === undefined) return -1
    const lines = to.lines.get(key)
    if (!lines?.length) return -1
    return lines[Math.min(from.nths[index], lines.length - 1)]
}

/**
 * A 0-based document line of one Pseudocode of a function, found in another of it: the line
 * standing for the same thing. A line standing for nothing moves with the nearest one after it
 * that does, else before it, at the same distance; a line the other has no more (a deleted
 * comment's) goes to the next one it has. The header, and a line near none of them, keeps its
 * number, within the other's lines.
 */
export function movedPseudocodeLine(
    from: PseudocodeLines,
    to: PseudocodeLines,
    line: number
): number {
    const last = Math.max(0, to.firstLine + to.lines.length - 1)
    if (from.lines === to.lines || line < from.firstLine) return Math.min(line, last)
    const source = places(from)
    const target = places(to)
    const index = line - from.firstLine
    let missing = false
    for (
        let distance = 0;
        distance < NEAREST_PLACE && index + distance < source.keys.length;
        distance++
    ) {
        if (source.keys[index + distance] === undefined) continue
        const found = lineOfKey(source, target, index + distance)
        if (found >= 0) return Math.max(to.firstLine, missing ? found : found - distance)
        missing = true
    }
    missing = false
    for (let distance = 1; distance < NEAREST_PLACE && index - distance >= 0; distance++) {
        if (source.keys[index - distance] === undefined) continue
        const found = lineOfKey(source, target, index - distance)
        if (found >= 0) return Math.min(last, missing ? found : found + distance)
        missing = true
    }
    return Math.min(line, last)
}

/**
 * A 0-based column of a line, moved to the same token of the line standing for it: the same name
 * when the line holds the same tokens, renamed or not, at the same distance into it, or past its
 * end; else the column as it was.
 */
function movedColumn(
    from: DecompiledLine | undefined,
    to: DecompiledLine | undefined,
    column: number
): number {
    if (!from || !to || from.tokens.length !== to.tokens.length) return column
    let index = -1
    for (let at = 0; at < from.tokens.length && from.tokens[at].start <= column; at++) index = at
    if (index < 0) return column
    const before = from.tokens[index]
    const after = to.tokens[index]
    if (column >= before.end) return after.end + (column - before.end)
    return after.start + Math.min(column - before.start, after.end - after.start)
}

/** A 1-based Monaco position of one Pseudocode of a function, moved onto another. */
function movedPosition(
    from: PseudocodeLines,
    to: PseudocodeLines,
    position: monaco.IPosition
): monaco.IPosition {
    const line = position.lineNumber - 1
    const moved = movedPseudocodeLine(from, to, line)
    const column = movedColumn(
        from.lines[line - from.firstLine],
        to.lines[moved - to.firstLine],
        position.column - 1
    )
    return { lineNumber: moved + 1, column: column + 1 }
}

/**
 * An editor's saved view state over one Pseudocode of a function, moved onto another of it: its
 * cursors and selections, and its first visible line, which Monaco scrolls back to.
 */
export function movePseudocodeViewState(
    state: monaco.editor.ICodeEditorViewState,
    from: PseudocodeLines,
    to: PseudocodeLines
): monaco.editor.ICodeEditorViewState {
    const first = state.viewState.firstPosition
    return {
        ...state,
        cursorState: state.cursorState.map((cursor) => ({
            ...cursor,
            selectionStart: movedPosition(from, to, cursor.selectionStart),
            position: movedPosition(from, to, cursor.position)
        })),
        viewState: first
            ? {
                  ...state.viewState,
                  firstPosition: {
                      lineNumber: movedPseudocodeLine(from, to, first.lineNumber - 1) + 1,
                      column: first.column
                  }
              }
            : state.viewState
    }
}

/** The Pseudocode each saved view state was taken over, which `movePseudocodeViewState` starts from. */
const viewStatePseudocode = new WeakMap<monaco.editor.ICodeEditorViewState, PseudocodeLines>()

/** Notes the Pseudocode a view state was saved over. */
export function noteViewStatePseudocode(
    state: monaco.editor.ICodeEditorViewState | null,
    pseudocode: PseudocodeLines | undefined
): void {
    if (state && pseudocode) viewStatePseudocode.set(state, pseudocode)
}

/**
 * A saved view state as an editor showing `pseudocode` restores it: moved onto it from the
 * Pseudocode it was saved over, when that is another decompilation. A view state is kept by the
 * model of one function's Pseudocode, so both are of the same function.
 */
export function pseudocodeViewStateFor(
    state: monaco.editor.ICodeEditorViewState,
    pseudocode: PseudocodeLines | undefined
): monaco.editor.ICodeEditorViewState {
    const from = viewStatePseudocode.get(state)
    return from && pseudocode && from.lines !== pseudocode.lines
        ? movePseudocodeViewState(state, from, pseudocode)
        : state
}
