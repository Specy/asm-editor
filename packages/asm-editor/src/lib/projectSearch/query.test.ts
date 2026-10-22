import { describe, expect, it } from 'vite-plus/test'
import {
    compileMatcher,
    isWholeWord,
    namesLineBreak,
    pathFilter,
    queryProblem,
    SearchQueryError
} from './query'

describe('compiling a query', () => {
    it('searches nothing for an empty query', () => {
        expect(compileMatcher({ text: '' })).toBeUndefined()
        expect(compileMatcher({ text: '', regex: true })).toBeUndefined()
        expect(queryProblem({ text: '', regex: true })).toBeUndefined()
    })

    it('finds a plain query by its lower case in any case, as it is with Match case', () => {
        expect(compileMatcher({ text: 'StrCmp' })).toMatchObject({
            kind: 'plain',
            needle: 'strcmp',
            anyCase: true,
            wholeWord: false
        })
        expect(compileMatcher({ text: 'StrCmp', matchCase: true, wholeWord: true })).toEqual({
            kind: 'plain',
            needle: 'StrCmp',
            anyCase: false,
            wholeWord: true,
            fallback: undefined
        })
    })

    it('takes a plain query that lowering lengthens as a literal pattern in any case', () => {
        const matcher = compileMatcher({ text: 'İd(' })
        expect(matcher?.kind).toBe('regex')
        if (matcher?.kind !== 'regex') return
        expect(matcher.pattern.flags).toBe('giu')
        expect(matcher.pattern.source).toBe('İd\\(')
    })

    it('compiles a regular expression with `g` and `m`, `i` in any case, and `u` where it can', () => {
        const pattern = (text: string, matchCase = false) => {
            const matcher = compileMatcher({ text, regex: true, matchCase })
            return matcher?.kind === 'regex' ? matcher.pattern : undefined
        }
        expect(pattern('str(n)?cmp\\(')?.flags).toBe('gimu')
        expect(pattern('\\w+Var\\d+', true)?.flags).toBe('gmu')
        //valid only without `u`: a lone brace, an escaped hyphen
        expect(pattern('a{2')?.flags).toBe('gim')
        expect(pattern('rbp\\-8')?.flags).toBe('gim')
        //`\p{…}` is a property with `u`
        expect(pattern('\\p{Lu}+', true)?.test('ÉTÉ')).toBe(true)
    })

    it('keeps a regular expression on one line unless it names a line break', () => {
        const singleLine = (text: string) => {
            const matcher = compileMatcher({ text, regex: true })
            return matcher?.kind === 'regex' && matcher.singleLine
        }
        expect(singleLine('mov\\s+rax')).toBe(true)
        expect(singleLine('[\\s\\S]+')).toBe(true)
        expect(singleLine('ret\\n\\nmain')).toBe(false)
    })

    it('says why a regular expression does not compile, as a sentence', () => {
        expect(() => compileMatcher({ text: 'str(cmp', regex: true })).toThrow(SearchQueryError)
        expect(queryProblem({ text: 'str(cmp', regex: true })).toBe(
            'Not a valid regular expression: unterminated group.'
        )
        expect(queryProblem({ text: '*rax', regex: true })).toBe(
            'Not a valid regular expression: nothing to repeat.'
        )
        expect(queryProblem({ text: '[a', regex: true })).toMatch(
            /^Not a valid regular expression: .+\.$/
        )
        //the same text is a plain query anyone can search for
        expect(queryProblem({ text: 'str(cmp' })).toBeUndefined()
    })
})

describe('naming a line break', () => {
    it('takes the escapes and the characters themselves, not an escaped backslash', () => {
        for (const source of [
            'a\\nb',
            '\\r',
            '\\x0a',
            '\\x0D',
            '\\u000a',
            '\\u{d}',
            '\\cJ',
            'a\nb'
        ])
            expect(namesLineBreak(source), source).toBe(true)
        for (const source of ['\\\\n', '\\s+', '[^a]', 'n', '\\x0b', '\\u000b'])
            expect(namesLineBreak(source), source).toBe(false)
    })
})

describe('whole words', () => {
    const whole = (text: string, query: string, from = 0) => {
        const start = text.indexOf(query, from)
        return isWholeWord(text, start, start + query.length)
    }

    it('are bounded by `@` and `.`, not by `_`', () => {
        expect(whole('call printf@plt', 'printf')).toBe(true)
        expect(whole('call puts@plt', '@plt')).toBe(true)
        expect(whole('jmp .LAB_3', 'LAB_3')).toBe(true)
        expect(whole('jmp .LAB_3', '.LAB_3')).toBe(true)
        expect(whole('jmp .LAB_3', 'LAB')).toBe(false)
        expect(whole('call __printf_chk', 'printf')).toBe(false)
        expect(whole('call _printf', 'printf')).toBe(false)
        expect(whole('call _printf', '_printf')).toBe(true)
    })

    it('are bounded by the text, spaces, line breaks and punctuation', () => {
        expect(whole('rax', 'rax')).toBe(true)
        expect(whole('mov rax,[rbx]\n', 'rax')).toBe(true)
        expect(whole('mov rbx,[rax]\n', 'rax')).toBe(true)
        expect(whole('add\nrax', 'rax')).toBe(true)
        expect(whole('a$b#c~d?e:f', 'c')).toBe(true)
        expect(whole('eax raxe', 'rax')).toBe(false)
    })

    it('take letters and digits of any script as part of a word', () => {
        expect(whole('café au lait', 'caf')).toBe(false)
        expect(whole('café au lait', 'café')).toBe(true)
        expect(whole('число=1', 'число')).toBe(true)
        expect(whole('числа', 'числ')).toBe(false)
        //a combining accent continues the word it is on
        expect(whole('café', 'cafe')).toBe(false)
        //a letter outside the Basic Multilingual Plane, a surrogate pair, too
        expect(whole('x𝑥', 'x')).toBe(false)
        expect(whole('𝑥y', 'y')).toBe(false)
        expect(whole('😀rax😀', 'rax')).toBe(true)
    })

    it('can be zero-length, with no word on either side', () => {
        expect(isWholeWord('a  b', 2, 2)).toBe(true)
        expect(isWholeWord(' a', 0, 0)).toBe(true)
        expect(isWholeWord('a ', 2, 2)).toBe(true)
        expect(isWholeWord('a b', 1, 1)).toBe(false)
        expect(isWholeWord('ab', 0, 0)).toBe(false)
        expect(isWholeWord('ab', 2, 2)).toBe(false)
    })
})

describe('include and exclude patterns', () => {
    const paths = [
        'main.s',
        'start.S',
        'src/main.c',
        'src/lib/util.c',
        'src/lib/util.h',
        'test/main.c',
        'docs/build',
        'build/out.txt',
        'a',
        'notes/a b.md'
    ]
    const included = (include: string, exclude = '') => paths.filter(pathFilter(include, exclude))

    it('searches every path with no patterns', () => {
        expect(included('')).toEqual(paths)
        expect(included(' , ,')).toEqual(paths)
    })

    it('match a name in any folder when the pattern has no slash, in any case', () => {
        expect(included('*.c')).toEqual(['src/main.c', 'src/lib/util.c', 'test/main.c'])
        expect(included('*.s')).toEqual(['main.s', 'start.S'])
        expect(included('?')).toEqual(['a'])
        expect(included('main.*')).toEqual(['main.s', 'src/main.c', 'test/main.c'])
        expect(included('a b.md')).toEqual(['notes/a b.md'])
    })

    it('take everything in a folder they match', () => {
        expect(included('lib')).toEqual(['src/lib/util.c', 'src/lib/util.h'])
        //a File named `build` and the folder `build`
        expect(included('build')).toEqual(['docs/build', 'build/out.txt'])
        //only folders, with a slash at the end
        expect(included('build/')).toEqual(['build/out.txt'])
    })

    it('match from the root when the pattern has a slash', () => {
        expect(included('src/**')).toEqual(['src/main.c', 'src/lib/util.c', 'src/lib/util.h'])
        expect(included('src/*.c')).toEqual(['src/main.c'])
        expect(included('src/lib')).toEqual(['src/lib/util.c', 'src/lib/util.h'])
        expect(included('/main.s')).toEqual(['main.s'])
        expect(included('./test')).toEqual(['test/main.c'])
        expect(included('lib/*.c')).toEqual([])
        expect(included('**/lib/*.c')).toEqual(['src/lib/util.c'])
        expect(included('**/main.c')).toEqual(['src/main.c', 'test/main.c'])
        expect(included('**')).toEqual(paths)
    })

    it('take sets, braces and a backslash escape', () => {
        expect(included('*.[ch]')).toEqual([
            'src/main.c',
            'src/lib/util.c',
            'src/lib/util.h',
            'test/main.c'
        ])
        expect(included('util.[!c]')).toEqual(['src/lib/util.h'])
        expect(included('*.{s,h}')).toEqual(['main.s', 'start.S', 'src/lib/util.h'])
        expect(included('{src,test}/main.c')).toEqual(['src/main.c', 'test/main.c'])
        expect(included('\\?')).toEqual([])
        //a set that cannot be one is taken literally, and so is an unclosed one
        expect(included('[z-a]')).toEqual([])
        expect(included('[ab')).toEqual([])
    })

    it('splits at commas, but not inside braces', () => {
        expect(included('*.s, test/**')).toEqual(['main.s', 'start.S', 'test/main.c'])
        expect(included('*.{c,h}')).toEqual(included('*.c,*.h'))
    })

    it('exclude what an exclude pattern matches, even if included', () => {
        expect(included('', 'src')).toEqual(paths.filter((path) => !path.startsWith('src/')))
        expect(included('*.c', 'test/**')).toEqual(['src/main.c', 'src/lib/util.c'])
        expect(included('*.c', '*.c')).toEqual([])
        expect(included('', '*.md, build/')).toEqual(
            paths.filter((path) => path !== 'notes/a b.md' && path !== 'build/out.txt')
        )
    })
})
