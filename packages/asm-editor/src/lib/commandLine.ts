/**
 * The **Command line** ([CONTEXT.md](../../../../CONTEXT.md)): the name an x86 program is started
 * under and its **Arguments**, typed as in a shell
 * ([binary-import.md](../../../../docs/design/binary-import.md), decision 12). It is not a shell:
 * the text is split into words and nothing else happens to it.
 */

export type CommandLineParse = { args: string[] } | { error: string; column: number }

/** Where a Diagnostic about the Arguments comes from, which is no File: a Build they stopped. */
export const ARGUMENTS_DIAGNOSTIC_SOURCE = 'Arguments'

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f', '\v'])

/** What a backslash inside double quotes escapes; before anything else it stays itself. */
const DOUBLE_QUOTE_ESCAPES = new Set(['"', '\\', '$', '`'])

/**
 * The words of a Command line's Arguments, by a POSIX shell's quoting rules and nothing more:
 * whitespace separates words; `'…'` is literal; `"…"` is literal except for `\"`, `\\`, `\$` and
 * `` \` ``; a backslash outside quotes takes the next character literally (a trailing one is itself,
 * as `sh -c` reads it); quoted and unquoted parts next to each other are one word (`'it''s'` is
 * `its`), and `''` is an empty word. No variable expansion, globbing, comments or operators:
 * `|`, `>`, `;`, `&`, `$`, `*`, `~` and `#` are ordinary characters. An unterminated quote is an
 * error naming the column (1-based, in characters) of the quote that opened it.
 */
export function parseCommandLine(text: string): CommandLineParse {
    const characters = [...text]
    const args: string[] = []
    let word = ''
    //a word exists once anything of it was read, quotes included, so `''` is an empty word
    let inWord = false
    for (let i = 0; i < characters.length; i++) {
        const character = characters[i]
        if (WHITESPACE.has(character)) {
            if (inWord) args.push(word)
            word = ''
            inWord = false
            continue
        }
        inWord = true
        if (character === '\\') {
            const next = characters[i + 1]
            if (next === undefined) word += '\\'
            else {
                word += next
                i++
            }
        } else if (character === "'") {
            const close = characters.indexOf("'", i + 1)
            if (close === -1) return unterminated('single', i)
            word += characters.slice(i + 1, close).join('')
            i = close
        } else if (character === '"') {
            const opened = i
            let closed = false
            for (i++; i < characters.length; i++) {
                const inner = characters[i]
                if (inner === '"') {
                    closed = true
                    break
                }
                if (inner === '\\' && DOUBLE_QUOTE_ESCAPES.has(characters[i + 1])) {
                    word += characters[i + 1]
                    i++
                } else word += inner
            }
            if (!closed) return unterminated('double', opened)
        } else word += character
    }
    if (inWord) args.push(word)
    return { args }
}

function unterminated(kind: 'single' | 'double', index: number): CommandLineParse {
    const quote = kind === 'single' ? "'" : '"'
    return {
        error: `The ${kind} quote (${quote}) at column ${index + 1} is never closed`,
        column: index + 1
    }
}

/**
 * The name a program runs under, after `./`: an Executable's Entry path, or an assembled program's
 * Entry path without its extension, as a shell user would have named the program the assembler and
 * linker made (`main.asm` runs as `./main`). A compiled program, whose Entry is Generated assembly
 * (`main.c.asm`), is named after the source File it was compiled from (`compiledFrom`, `main.c`),
 * likewise without its extension, as `cc -o main main.c` names it.
 */
export function commandLineProgram(
    entry: string,
    executable: boolean,
    compiledFrom?: string
): string {
    if (executable) return entry
    return withoutExtension(compiledFrom ?? entry)
}

function withoutExtension(path: string): string {
    const slash = path.lastIndexOf('/')
    const dot = path.lastIndexOf('.')
    //a dot that starts the file name (`.hidden`) is no extension
    return dot > slash + 1 ? path.slice(0, dot) : path
}

/**
 * The source File the Entry's Generated assembly was compiled from, by the Project's compilation
 * records (the newest for that output, as a Build reads them); undefined for any other Entry.
 */
export function compiledEntrySource(
    entry: string,
    compilations: readonly { sourcePath: string; outputPath: string }[] | undefined
): string | undefined {
    return compilations?.filter((record) => record.outputPath === entry).at(-1)?.sourcePath
}

/** `argv[0]` for a program: its name as typed in a shell, `./crackme`. */
export function programArgv0(entry: string, executable: boolean, compiledFrom?: string): string {
    return `./${commandLineProgram(entry, executable, compiledFrom)}`
}

/** The parsed `argv` as the Command line's tooltip lists it, one entry a line. */
export function describeArgv(argv0: string, args: readonly string[]): string {
    return [argv0, ...args]
        .map((word, index) => `argv[${index}] = ${JSON.stringify(word)}`)
        .join('\n')
}
