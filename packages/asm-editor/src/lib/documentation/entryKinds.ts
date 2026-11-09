/*
 * The kinds of Documentation entry and whether their names are code, apart from the entries
 * themselves (entries.ts), which reach the lecture parser: the search palette reads these alone.
 */

export type EntryKind =
    | 'instruction'
    | 'directive'
    | 'syscall'
    | 'trap-task'
    | 'register'
    | 'flag'
    | 'condition-code'
    | 'addressing-mode'
    | 'port'
    | 'screen-command'
    | 'extension-group'
    | 'function'
    | 'prose'

/** Kinds whose names are code (`move`, `.data`, `$t0`), set in the code font; the rest are words. */
const CODE_NAMED_KINDS = new Set<EntryKind>([
    'instruction',
    'function',
    'directive',
    'register',
    'flag',
    'condition-code'
])

/**
 * Whether an entry's name is code. An entry can say so itself, where its kind is spelled both ways:
 * an M68K addressing mode is named in words ("Direct"), a Z80 operand placeholder in code (`(hl)`).
 */
export function hasCodeName(entry: { kind: EntryKind; codeName?: boolean }): boolean {
    return entry.codeName ?? CODE_NAMED_KINDS.has(entry.kind)
}
