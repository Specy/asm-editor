import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vite-plus/test'
import {
    commandLineProgram,
    compiledEntrySource,
    describeArgv,
    parseCommandLine,
    programArgv0,
    programLabel,
    programsByLabel
} from './commandLine'

/**
 * The Command line's Arguments are split by a POSIX shell's quoting rules and nothing else
 * ([binary-import.md](../../../../docs/design/binary-import.md), decision 12, plan M10.2).
 */
function hasShell(): boolean {
    try {
        return execFileSync('sh', ['-c', 'printf ok'], { encoding: 'utf8' }) === 'ok'
    } catch {
        return false
    }
}

const words = (text: string) => {
    const parsed = parseCommandLine(text)
    if ('error' in parsed) throw new Error(parsed.error)
    return parsed.args
}

describe('parseCommandLine', () => {
    it('gives no words for empty input or whitespace alone', () => {
        expect(words('')).toEqual([])
        expect(words('   ')).toEqual([])
        expect(words('\t \t')).toEqual([])
    })

    it('separates words at any run of whitespace', () => {
        expect(words('hunter2')).toEqual(['hunter2'])
        expect(words('  a   b\tc  ')).toEqual(['a', 'b', 'c'])
        expect(words('1 2 3 4 5')).toEqual(['1', '2', '3', '4', '5'])
    })

    it('keeps the spaces inside quotes', () => {
        expect(words('hunter2 "two words"')).toEqual(['hunter2', 'two words'])
        expect(words("'two  words'")).toEqual(['two  words'])
        expect(words('"  padded  "')).toEqual(['  padded  '])
    })

    it('joins quoted and unquoted parts that touch into one word', () => {
        expect(words("'it''s'")).toEqual(['its'])
        expect(words('pre"mid"post')).toEqual(['premidpost'])
        expect(words(`a'b'"c"d`)).toEqual(['abcd'])
        expect(words(`--name="John Smith"`)).toEqual(['--name=John Smith'])
    })

    it('reads an empty pair of quotes as an empty word', () => {
        expect(words("''")).toEqual([''])
        expect(words('""')).toEqual([''])
        expect(words("a '' b")).toEqual(['a', '', 'b'])
    })

    it('takes everything inside single quotes literally, backslashes included', () => {
        expect(words(`'a\\b'`)).toEqual(['a\\b'])
        expect(words(`'say "hi"'`)).toEqual(['say "hi"'])
        expect(words(`'$HOME *'`)).toEqual(['$HOME *'])
    })

    it('reads only \\" \\\\ \\$ and \\` as escapes inside double quotes', () => {
        expect(words(`"a \\"quoted\\" word"`)).toEqual(['a "quoted" word'])
        expect(words(`"back\\\\slash"`)).toEqual(['back\\slash'])
        expect(words(`"\\$HOME and \\\`date\\\`"`)).toEqual(['$HOME and `date`'])
        expect(words(`"\\n stays \\t"`)).toEqual(['\\n stays \\t'])
        expect(words(`"it's"`)).toEqual(["it's"])
    })

    it('lets a backslash outside quotes take the next character literally', () => {
        expect(words('a\\ b')).toEqual(['a b'])
        expect(words("it\\'s")).toEqual(["it's"])
        expect(words('\\"x\\"')).toEqual(['"x"'])
        expect(words('\\\\')).toEqual(['\\'])
        expect(words('\\n')).toEqual(['n'])
    })

    it('keeps a trailing backslash, as sh -c does', () => {
        expect(words('end\\')).toEqual(['end\\'])
    })

    it('expands nothing: operators, variables, globs and comments are characters', () => {
        expect(words('a | b > c ; d & e')).toEqual(['a', '|', 'b', '>', 'c', ';', 'd', '&', 'e'])
        expect(words('$HOME ~ *.txt #comment')).toEqual(['$HOME', '~', '*.txt', '#comment'])
        expect(words('a>b')).toEqual(['a>b'])
    })

    it('keeps text that is not ASCII', () => {
        expect(words('héllo "wörld 🌍"')).toEqual(['héllo', 'wörld 🌍'])
    })

    it('names the column of a quote that is never closed', () => {
        expect(parseCommandLine("abc 'def")).toEqual({
            error: "The single quote (') at column 5 is never closed",
            column: 5
        })
        expect(parseCommandLine('"')).toEqual({
            error: 'The double quote (") at column 1 is never closed',
            column: 1
        })
        expect(parseCommandLine(`ok "a \\" b`)).toMatchObject({ column: 4 })
        //a single quote inside double quotes opens nothing
        expect(parseCommandLine(`"it's" 'x`)).toMatchObject({ column: 8 })
        //columns count characters, not UTF-16 units
        expect(parseCommandLine('🌍 "x')).toMatchObject({ column: 3 })
    })

    //only quoting, which a shell reads without running or expanding anything: operators,
    //variables and globs would make it do more than split words
    it.skipIf(!hasShell())('splits quoting as the host shell does', () => {
        const cases = [
            'hunter2 "two words"',
            "'it''s'",
            'a\\ b',
            `"a \\"b\\" \\\\ \\$x \\\`y\\\` \\n" 'c\\d' e\\f`,
            'pre\'mid\'"post" \'\' ""',
            "  spaced\\  'out  ' ",
            'end\\'
        ]
        for (const text of cases) {
            const output = execFileSync('sh', ['-c', `printf '%s\\0' ${text}`], {
                encoding: 'utf8'
            })
            expect(words(text), text).toEqual(output.split('\0').slice(0, -1))
        }
    })
})

describe('the program a Command line names', () => {
    it('is an Executable by its Entry path', () => {
        expect(commandLineProgram('crackme', true)).toBe('crackme')
        expect(commandLineProgram('bin/chall.elf', true)).toBe('bin/chall.elf')
        expect(programArgv0('crackme', true)).toBe('./crackme')
    })

    it('is an assembled program by its Entry path without the extension', () => {
        expect(commandLineProgram('main.asm', false)).toBe('main')
        expect(commandLineProgram('src/game.s', false)).toBe('src/game')
        expect(commandLineProgram('main', false)).toBe('main')
        expect(commandLineProgram('a.b.c', false)).toBe('a.b')
        expect(commandLineProgram('.hidden', false)).toBe('.hidden')
        expect(commandLineProgram('dir.d/main', false)).toBe('dir.d/main')
        expect(programArgv0('main.asm', false)).toBe('./main')
    })

    it('is a compiled program by the source File it was compiled from', () => {
        expect(commandLineProgram('main.c.asm', false, 'main.c')).toBe('main')
        expect(commandLineProgram('out/renamed.asm', false, 'src/game.cpp')).toBe('src/game')
        expect(programArgv0('main.c.asm', false, 'main.c')).toBe('./main')
        const records = [
            { sourcePath: 'old.c', outputPath: 'main.c.asm' },
            { sourcePath: 'main.c', outputPath: 'main.c.asm' },
            { sourcePath: 'other.c', outputPath: 'other.c.asm' }
        ]
        expect(compiledEntrySource('main.c.asm', records)).toBe('main.c')
        expect(compiledEntrySource('main.asm', records)).toBeUndefined()
        expect(compiledEntrySource('main.c.asm', undefined)).toBeUndefined()
    })

    it('lists argv one entry a line for the tooltip', () => {
        expect(describeArgv('./crackme', ['hunter2', 'two words'])).toBe(
            'argv[0] = "./crackme"\nargv[1] = "hunter2"\nargv[2] = "two words"'
        )
    })
})

/**
 * What the picker calls a Program, and the order it lists them in, which is also how "the first one
 * left" is chosen ([programs.md](../../../../docs/design/programs.md), decisions 7, 9 and 13).
 */
describe('the label of a Program', () => {
    const records = [{ sourcePath: 'sort.c', outputPath: 'sort.c.mips' }]
    const file = { encoding: 'plain', content: '' }

    it('is a compiled program by its source while that File exists, else by its Entry path', () => {
        const files = { 'sort.c': file, 'sort.c.mips': file, 'main.s': file }
        expect(programLabel('sort.c.mips', records, files)).toBe('sort.c')
        expect(programLabel('main.s', records, files)).toBe('main.s')
        expect(programLabel('sort.c.mips', records, { 'sort.c.mips': file })).toBe('sort.c.mips')
        expect(programLabel('sort.c.mips', undefined, files)).toBe('sort.c.mips')
    })

    it('orders Programs by label, then by Entry path, whatever order they were saved in', () => {
        const project = {
            programs: { 'z.s': {}, 'sort.c.mips': {}, 'main.s': {}, 'sort.c': {} },
            files: { 'sort.c': file },
            compilations: records
        }
        expect(programsByLabel(project)).toEqual([
            { entry: 'main.s', label: 'main.s' },
            { entry: 'sort.c', label: 'sort.c' },
            { entry: 'sort.c.mips', label: 'sort.c' },
            { entry: 'z.s', label: 'z.s' }
        ])
        expect(programsByLabel({ programs: {}, files: {} })).toEqual([])
    })
})
