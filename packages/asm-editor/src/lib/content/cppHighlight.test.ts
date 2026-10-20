import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Code } from 'mdast'
import { language } from 'monaco-editor/languages/definitions/cpp/cpp.js'
import { tokenizeCpp, type CppTokenKind } from './cppHighlight'

/**
 * The highlighter follows Monaco's C/C++ grammar rule by rule, so these hold it to each rule,
 * including the ones where the grammar reads C loosely: the point is that a code block reads as the
 * editor, not as a compiler. The browser parity check in the plan compared it with the editor
 * itself, character by character.
 */

/**
 * A program's tokens as `kind text`, a bracket with its level (`!` for none) and whitespace left
 * out, so a case reads as the line it checks.
 */
function described(code: string): string[] {
    return tokenizeCpp(code)
        .flat()
        .filter((token) => token.kind !== 'plain' || token.text.trim() !== '')
        .map((token) =>
            token.kind === 'bracket'
                ? `bracket ${token.text}${token.level ?? '!'}`
                : `${token.kind} ${token.kind === 'plain' ? token.text.trim() : token.text}`
        )
}

/** The kind of the token whose text is exactly `text`. */
function kindOf(code: string, text: string): CppTokenKind | undefined {
    return tokenizeCpp(code)
        .flat()
        .find((token) => token.text === text)?.kind
}

/** Nothing may be dropped or invented: the tokens must rebuild the source exactly. */
function rebuild(code: string) {
    return tokenizeCpp(code)
        .map((line) => line.map((token) => token.text).join(''))
        .join('\n')
}

describe('tokenizeCpp', () => {
    it('reads every keyword of the grammar as one, and any other name as a name', () => {
        expect(language.keywords.length).toBeGreaterThan(100)
        expect(
            language.keywords.filter((keyword) => kindOf(`x ${keyword} y`, keyword) !== 'keyword')
        ).toEqual([])
        //the grammar knows no types beyond its keywords, nor any library name
        expect(described('size_t n = strlen(s);').slice(0, 2)).toEqual([
            'identifier size_t',
            'identifier n'
        ])
        expect(kindOf('integer', 'integer')).toBe('identifier')
    })

    it('reads an #include and the path it names', () => {
        expect(described('#include <stdio.h>')).toEqual([
            'directive #include',
            'directive <',
            'string stdio.h',
            'directive >'
        ])
        expect(described('  #  include "local.h"')).toEqual([
            'directive   #  include',
            'directive "',
            'string local.h',
            'directive "'
        ])
    })

    it('waits for the path an #include names, across lines, as the grammar does', () => {
        //`HEADER` is no path, so nothing is read until a quoted one comes
        expect(described('#include HEADER\nint x = f("a.h");')).toEqual([
            'directive #include',
            'plain HEADER',
            'plain int x = f',
            'bracket (0',
            'directive "',
            'string a.h',
            'directive "',
            'bracket )0',
            'delimiter ;'
        ])
    })

    it('reads any other preprocessor line by its #name, from the first column only', () => {
        expect(described('#define MAX 4')).toEqual([
            'directive #define',
            'identifier MAX',
            'number 4'
        ])
        expect(kindOf('# 1 "file.c"', '# 1')).toBe('directive')
        expect(described('x; #define y')).toEqual([
            'identifier x',
            'delimiter ;',
            'plain #',
            'identifier define',
            'identifier y'
        ])
    })

    it('reads line comments, and one a backslash continues onto the next line', () => {
        expect(described('x; // note')).toEqual(['identifier x', 'delimiter ;', 'comment // note'])
        expect(
            tokenizeCpp('// one \\\nstill \\\nand still\nint x;').map((line) => line[0])
        ).toEqual([
            { kind: 'comment', text: '// one \\' },
            { kind: 'comment', text: 'still \\' },
            { kind: 'comment', text: 'and still' },
            { kind: 'keyword', text: 'int' }
        ])
    })

    it('reads block and documentation comments across lines', () => {
        expect(tokenizeCpp('/* one\ntwo */ int x;').map((line) => line[0])).toEqual([
            { kind: 'comment', text: '/* one' },
            { kind: 'comment', text: 'two */' }
        ])
        expect(tokenizeCpp('/** one\n * two */ x').map((line) => line[0])).toEqual([
            { kind: 'doc-comment', text: '/** one' },
            { kind: 'doc-comment', text: ' * two */' }
        ])
        //`/**/` opens and closes an ordinary comment
        expect(described('/**/ x')).toEqual(['comment /**/', 'identifier x'])
    })

    it('reads strings with their escapes, valid or not', () => {
        expect(described('"a\\n\\x41\\u00e9\\e"')).toEqual([
            'string "a',
            'escape \\n\\x41\\u00e9',
            'invalid-escape \\e',
            'string "'
        ])
    })

    it('reads a string the line ends inside as invalid, and one a backslash continues', () => {
        expect(described('s = "open; x')).toEqual([
            'identifier s',
            'delimiter =',
            'invalid-string "open; x'
        ])
        //the backslash itself is the grammar's no-token, and the string goes on
        expect(tokenizeCpp('s = "one \\\ntwo"; x')[1]).toEqual([
            { kind: 'string', text: 'two"' },
            { kind: 'delimiter', text: ';' },
            { kind: 'plain', text: ' ' },
            { kind: 'identifier', text: 'x' }
        ])
        expect(kindOf('s = "one \\\ntwo"; x', '\\')).toBe('plain')
    })

    it('reads character literals, and a quote that opens none as invalid', () => {
        expect(kindOf("c = 'a';", "'a'")).toBe('string')
        expect(described("c = '\\n';").slice(2)).toEqual([
            "string '",
            'escape \\n',
            "string '",
            'delimiter ;'
        ])
        expect(described("c = 'ab';").slice(2)).toEqual([
            "invalid-string '",
            'identifier ab',
            "invalid-string '",
            'delimiter ;'
        ])
        //an encoding prefix is a name before the literal
        expect(described("L'a'")).toEqual(['identifier L', "string 'a'"])
    })

    it('reads raw strings with their encoding prefixes, across lines', () => {
        expect(described('auto s = R"tag(a "quoted" (x))tag";').slice(3)).toEqual([
            'string R"tag(a "quoted" (x))tag"',
            'delimiter ;'
        ])
        expect(kindOf('u8R"(x)"', 'u8R"(x)"')).toBe('string')
        expect(kindOf('LR"(x)"', 'LR"(x)"')).toBe('string')
        expect(tokenizeCpp('R"x(one\n)" two\n)x" y')).toEqual([
            [{ kind: 'string', text: 'R"x(one' }],
            [{ kind: 'string', text: ')" two' }],
            [
                { kind: 'string', text: ')x"' },
                { kind: 'plain', text: ' ' },
                { kind: 'identifier', text: 'y' }
            ]
        ])
        //the grammar ends a raw string at its delimiter's first dotted part
        expect(described('R"a.b(x)a" y')).toEqual(['string R"a.b(x)a"', 'identifier y'])
    })

    it('reads every number form the grammar does, with suffixes and separators', () => {
        const cases: [string, CppTokenKind][] = [
            ['42', 'number'],
            ["1'000'000ULL", 'number'],
            ['10lu', 'number'],
            ['09', 'number'],
            ['017', 'octal'],
            ["0'7", 'octal'],
            ['0x1F', 'hex'],
            ["0XFF'FFul", 'hex'],
            ['0b1010', 'binary'],
            ["0B1'0u", 'binary'],
            ['1.5f', 'float'],
            ['.5', 'float'],
            ['3.14L', 'float'],
            ['1e10', 'float'],
            ['2E-3f', 'float'],
            //the exponent's digits are optional to the grammar
            ['1e', 'float']
        ]
        for (const [text, kind] of cases)
            expect([text, kindOf(`x = ${text};`, text)]).toEqual([text, kind])
        //and what it does not read as one number
        expect(described('1. 0x 0x1.8p3')).toEqual([
            'number 1',
            'delimiter .',
            'number 0',
            'identifier x',
            'hex 0x1',
            'float .8',
            'identifier p3'
        ])
    })

    it("reads a run of symbols as an operator only when it is one of the grammar's", () => {
        expect(described('a += b && !c;')).toEqual([
            'identifier a',
            'delimiter +=',
            'identifier b',
            'delimiter &&',
            'delimiter !',
            'identifier c',
            'delimiter ;'
        ])
        expect(described('p->x; std::f; x=-1')).toEqual([
            'identifier p',
            'plain ->',
            'identifier x',
            'delimiter ;',
            'identifier std',
            'plain ::',
            'identifier f',
            'delimiter ;',
            'identifier x',
            'plain =-',
            'number 1'
        ])
        //a comment glued to an operator is part of the run
        expect(described('x =// y')).toEqual(['identifier x', 'plain =//', 'identifier y'])
        //`<` and `>` are the grammar's brackets, read one at a time before any run of symbols, so
        //`<=>` is a `<` and a `=>` it does not know
        expect(described('a <=> b')).toEqual([
            'identifier a',
            'delimiter <',
            'plain =>',
            'identifier b'
        ])
    })

    it("reads an attribute's names, keywords and punctuation, its brackets as brackets", () => {
        expect(described('[[nodiscard]] int f();')).toEqual([
            'bracket [0',
            'bracket [1',
            'annotation nodiscard',
            'bracket ]1',
            'bracket ]0',
            'keyword int',
            'identifier f',
            'bracket (0',
            'bracket )0',
            'delimiter ;'
        ])
        expect(described('[[using gnu: hot, aligned(8)]]').slice(2, -2)).toEqual([
            'keyword using',
            'annotation gnu',
            'delimiter :',
            'annotation hot',
            'delimiter ,',
            'annotation aligned',
            'bracket (2',
            'annotation 8',
            'bracket )2'
        ])
        //a string inside one is no string to the grammar, and a comment is still a comment
        expect(described('[[deprecated("x") /* why */]]').slice(2, -2)).toEqual([
            'annotation deprecated',
            'bracket (2',
            'plain "',
            'annotation x',
            'plain "',
            'bracket )2',
            'comment /* why */'
        ])
        //and one runs across lines until its `]]`
        expect(tokenizeCpp('[[\n  maybe_unused\n]] int x;')[1]).toEqual([
            { kind: 'plain', text: '  ' },
            { kind: 'annotation', text: 'maybe_unused' }
        ])
    })

    it('levels brackets by how deeply they nest, through the whole program', () => {
        const brackets = (code: string) =>
            tokenizeCpp(code)
                .flat()
                .filter((t) => t.kind === 'bracket')
                .map((t) => `${t.text}${t.level ?? '!'}`)
        expect(brackets('f(a[g({1})]);')).toEqual(['(0', '[1', '(2', '{3', '}3', ')2', ']1', ')0'])
        //across lines, and never inside a string, a character or a comment
        expect(brackets('int f() {\n    return "(" [0] /* ) */;\n}')).toEqual([
            '(0',
            ')0',
            '{0',
            '[1',
            ']1',
            '}0'
        ])
        //a closer nothing of its kind opened is unexpected, and so is an opener nothing closes
        expect(brackets('( ] ) [')).toEqual(['(0', ']!', ')0', '[!'])
        //a closer closes the innermost open bracket of its kind, and those inside stay unclosed
        expect(brackets('( [ )')).toEqual(['(0', '[!', ')0'])
        //`<` and `>` are not paired
        expect(brackets('std::vector<int> v;')).toEqual([])
    })

    it('reads a line ending in a carriage return as the editor does, and keeps the return', () => {
        expect(tokenizeCpp('// note\r\nint x;')[0]).toEqual([
            { kind: 'comment', text: '// note' },
            { kind: 'plain', text: '\r' }
        ])
    })

    it('rebuilds the source exactly', () => {
        const programs = [
            '',
            '\n',
            '#include <stdio.h>\n\nint main(void) {\n    printf("%d\\n", 1);\n    return 0;\n}\n',
            '/* open\n\n still */ x // a \\\n\n b',
            'auto s = LR"x(\n)" (\n)x" [[a, b(1)]] \'\\\'\' "\\\n" 0x1\'2u .5e-3f',
            '\tx\r\n\ty;\r\n',
            '@ $ ` \\ #',
            "( ] ) [ } { 1'2'3 0b2 ->* <=> ..."
        ]
        for (const program of programs) expect(rebuild(program)).toBe(program)
    })
})

/** The C fences of a Markdown file, as the renderer reads them. */
function cFences(path: string): string[] {
    const fences: string[] = []
    const markdown = readFileSync(join(process.cwd(), path), 'utf8')
    visit(unified().use(remarkParse).parse(markdown), 'code', (node: Code) => {
        if (node.lang === 'c') fences.push(node.value)
    })
    return fences
}

describe("tokenizeCpp on the RISC-V chapter's examples", () => {
    const fences = cFences('src/lib/documentation/riscv/using-c.md')
    /** What the editor colours in a block: names, operators and punctuation left out. */
    const coloured = (code: string) =>
        described(code).filter((token) => !/^(?:identifier|delimiter|plain) /.test(token))

    it('finds the five C programs, and rebuilds each exactly', () => {
        expect(fences).toHaveLength(5)
        for (const fence of fences) expect(rebuild(fence)).toBe(fence)
    })

    it('colours the first program, the one every reader starts from', () => {
        expect(coloured(fences[0])).toEqual([
            'directive #include',
            'directive <',
            'string stdio.h',
            'directive >',
            'keyword int',
            'bracket (0',
            'keyword void',
            'bracket )0',
            'bracket {0',
            'bracket (1',
            'string "Hello from RISC-V',
            'escape \\n',
            'string "',
            'bracket )1',
            'keyword return',
            'number 0',
            'bracket }0'
        ])
    })

    it('colours the header, the quoted include, the input and the Screen programs', () => {
        expect(coloured(fences[1])).toEqual(['directive #define', 'number 42'])
        expect(coloured(fences[2]).slice(4, 8)).toEqual([
            'directive #include',
            'directive "',
            'string helpers.h',
            'directive "'
        ])
        expect(coloured(fences[2])).toContain('string "The answer is %d')
        expect(described(fences[3])).toEqual(
            expect.arrayContaining([
                'keyword if',
                'bracket (1',
                'bracket (2',
                'string "%d"',
                'delimiter &',
                'delimiter ==',
                'bracket {1',
                'bracket }1'
            ])
        )
        expect(coloured(fences[4]).slice(4, 9)).toEqual([
            'bracket (0',
            'number 64',
            'number 64',
            'number 1',
            'bracket )0'
        ])
        expect(described(fences[4])).toEqual(
            expect.arrayContaining(['identifier pixels', 'bracket [1', 'delimiter *', 'bracket ]1'])
        )
    })
})
