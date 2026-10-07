import { describe, expect, it } from 'vitest'
import { callAt, identifierAt, includeAt, scanSource } from './scan'

const scan = (text: string, cpp = true) => {
    const offset = text.indexOf('|')
    const source = scanSource(text.replace('|', ''))
    return {
        identifier: identifierAt(source, offset, cpp, true),
        include: includeAt(source, offset),
        call: callAt(source, offset, cpp)
    }
}
describe('C/C++ lexical help', () => {
    it.each([
        ['printf("%d,%d", f(1, 2), value|', 'printf', 2],
        ['printf("%d", abs(1,|', 'abs', 1],
        ['qsort(values, 4, sizeof(int), compare|', 'qsort', 3],
        ['printf("%d", (int[]){1, 2}[0], value|', 'printf', 2],
        ['printf("%d", array[index(1, 2)], value|', 'printf', 2],
        ['std :: printf("%d", value|', 'std::printf', 1],
        ['printf("\\\"comma,", value|', 'printf', 1],
        ["printf(\",\", '\\'', value|", 'printf', 2],
        ['printf(R"delim(a,b, printf( , )delim", value|', 'printf', 1],
        ['printf(u8R"custom(a,b,\n c)custom", value|', 'printf', 1],
        ['printf("%d", /* fake(a,b) */ value|', 'printf', 1],
        ['printf(\n// fake(a,b)\nvalue,|', 'printf', 1],
        ['printf("%d", \\\n value,|', 'printf', 2],
        ["printf(1'000, value|", 'printf', 1]
    ])('finds the current argument in %s', (text, name, argument) =>
        expect(scan(text, false).call ?? scan(text).call).toEqual({ name, argument })
    )
    it.each([
        '// printf(|',
        '// comment\\\n printf(|',
        '/* printf(|',
        '"printf(|',
        "'printf(|",
        'R"tag(printf(|',
        'u8R"long(printf(|',
        'L"printf(|',
        '/\\\n* printf(|',
        '/\\\n/ printf(|'
    ])('suppresses comments and literals: %s', (text) => {
        expect(scan(text).identifier).toBeUndefined()
        expect(scan(text).call).toBeUndefined()
    })
    it('suppresses the end of a line comment, but resumes on the next line', () => {
        expect(scan('// comment|\n').identifier).toBeUndefined()
        expect(scan('// comment\npri|').identifier?.name).toBe('pri')
    })
    it.each([
        'obj.printf(|',
        'ptr->printf(|',
        'other::printf(|',
        'outer::std::printf(|',
        'std::vector<int>(|',
        'printf(std::vector<int>{1, 2},|',
        '(*printf)(|',
        'void printf(|',
        'int printf(|',
        'int *printf(|',
        'printf((int|',
        'printf((size_t|',
        'printf(static_cast<int>(|'
    ])('declines ambiguous or unsupported calls: %s', (text) =>
        expect(scan(text).call).toBeUndefined()
    )
    it.each([
        'obj.pri|',
        'obj.|',
        'ptr->pri|',
        'ptr->|',
        'other::pri|',
        'other::|',
        'outer::std::pri|',
        'obj.std::|',
        'ptr->std::|'
    ])('declines member and unknown namespace lookup: %s', (text) =>
        expect(scan(text).identifier).toBeUndefined()
    )
    it('recognizes only explicit std qualification in C++ and replaces the name alone', () => {
        expect(scan('std::pri|').identifier).toMatchObject({
            prefix: 'pri',
            qualified: true,
            start: 5,
            end: 8
        })
        expect(scan('std::|').identifier).toMatchObject({ qualified: true, start: 5, end: 5 })
        expect(scan('std::pri|', false).identifier).toBeUndefined()
    })
    it.each([
        ['#include "sub/he|"', 'quoted', 'sub/he'],
        ['# include <std|>', 'system', 'std'],
        ['#include \\\n "he|"', 'quoted', 'he']
    ])('finds intentional include strings: %s', (text, kind, prefix) =>
        expect(scan(text).include).toMatchObject({ kind, prefix })
    )
    it.each(['/*\n#include "he|', '"unclosed\n#include "he|', '#include HEADER|'])(
        'declines fake or computed includes: %s',
        (text) => expect(scan(text).include).toBeUndefined()
    )
    it('declines spliced identifiers without treating their suffix as another name', () =>
        expect(scan('pri\\\nnt\\\nf|').identifier).toBeUndefined())
    it('resumes after a spliced block-comment ending', () =>
        expect(scan('/* comment *\\\n/ pri|').identifier?.name).toBe('pri'))
    it('does not keep a call active after its closing parenthesis', () =>
        expect(scan('printf("hello");|').call).toBeUndefined())
})
