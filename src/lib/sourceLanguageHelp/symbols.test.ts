import { describe, expect, it } from 'vitest'
import { scanSource } from './scan'
import { indexSourceSymbols, visibleSourceSymbols } from './symbols'
import type { HelpLanguage } from './context'

function visible(text: string, language: HelpLanguage = 'c') {
    const offset = text.indexOf('|')
    return visibleSourceSymbols(scanSource(text.replace('|', '')), language, offset)
}
const names = (text: string, language: HelpLanguage = 'c') =>
    visible(text, language).map((symbol) => symbol.name)

describe('current-file declarations', () => {
    it('finds globals, local variables and parameters in an unfinished function', () => {
        expect(
            names('int total; int sum(int count, const char *text) { int result = 0; |')
        ).toEqual(['result', 'text', 'count', 'sum', 'total'])
    })
    it('keeps C-only identifier spellings separate from C++ keywords', () => {
        expect(names('int class; int constexpr; int bool; int new(void); |')).toEqual([
            'new',
            'bool',
            'constexpr',
            'class'
        ])
        expect(names('typedef int class; class value; bool flag; |')).toEqual(['flag', 'value'])
        expect(names('int class; int constexpr; int bool; int new(void); |', 'cpp')).toEqual([])
        expect(names('int restrict; |', 'cpp')).toEqual(['restrict'])
    })
    it('tracks declarations in order rather than offering later variables or parameters from another function', () => {
        expect(names('int first; | int later; int next(int secret) { int hidden; }')).toEqual([
            'first'
        ])
        expect(
            names('int one(int secret) { int hidden; return secret; } int two(void) { | }')
        ).toEqual(['two', 'one'])
    })
    it('keeps closed block names out and gives inner shadowing precedence', () => {
        const text =
            'int value; void run(void) { int value; { double value; int hidden; | } int after; }'
        expect(visible(text).find((item) => item.name === 'value')?.declaration).toBe(
            'double value'
        )
        expect(names('int value; void run(void) { { int hidden; } | }')).toEqual(['run', 'value'])
    })
    it('recognizes pointers, references, arrays, comma declarations and compound initializers', () => {
        const entries = visible(
            'const char *text = "fake(int hidden)", *other; int values[4] = {1, 2}, result = call(1, 2); |'
        )
        expect(entries.map((item) => item.name)).toEqual(['result', 'values', 'other', 'text'])
        expect(entries.find((item) => item.name === 'other')?.declaration).toBe('const char *other')
        expect(entries.find((item) => item.name === 'values')?.declaration).toBe('int values[4]')
        expect(
            visible('int first; int &alias = first; |', 'cpp').find((item) => item.name === 'alias')
                ?.declaration
        ).toBe('int &alias')
    })
    it('recognizes ternary initializers, anonymous-struct typedefs and C++ direct initialization', () => {
        expect(names('int first = flag ? 1 : 2, second = 0; |')).toEqual(['second', 'first'])
        expect(names('typedef struct { int field; } Point; Point value; |')).toEqual(['value'])
        expect(
            names('struct Point { int field; }; Point value(42); int number(42), next(1); |', 'cpp')
        ).toEqual(['next', 'number', 'value'])
    })
    it('recognizes ordinary function pointers as variables without inventing callable signatures', () => {
        const entries = visible('int (*callback)(int, int); |')
        expect(entries[0]).toMatchObject({
            name: 'callback',
            kind: 'variable',
            declaration: 'int (*callback)(int, int)'
        })
        expect(entries[0].parameters).toBeUndefined()
    })
    it('keeps function-pointer parameters together and computes exact signature offsets', () => {
        const [entry] = visible(
            'int compare(const void *left, const void *right); void sort(int *values, int count, int (*compare)(const void *, const void *)); |'
        )
        expect(entry.name).toBe('sort')
        expect(entry.parameters).toHaveLength(3)
        expect(entry.parameters?.[2].label).toBe('int (*compare)(const void *, const void *)')
        for (const parameter of entry.parameters ?? [])
            expect(entry.declaration.slice(...parameter.range)).toBe(parameter.label)
    })
    it('indexes prototypes, recursion, zero arguments and variadics', () => {
        const entries = visible(
            'int read(void); int log(const char *format, ...); int sum(int value) { | }'
        )
        expect(entries.find((item) => item.name === 'read')?.parameters).toEqual([])
        expect(entries.find((item) => item.name === 'log')?.parameters?.[1].label).toBe('...')
        expect(entries.find((item) => item.name === 'sum')?.parameters?.[0].label).toBe('int value')
    })
    it('preserves unspecified C parameter lists and explicit C++ empty lists', () => {
        expect(visible('int read(); |')[0].parameters).toBeUndefined()
        expect(visible('int read(); |', 'cpp')[0].parameters).toEqual([])
        expect(visible('int read(); |', 'header')[0].parameters).toBeUndefined()
    })
    it('deduplicates a matching prototype/definition but declines ambiguous overloads', () => {
        expect(
            visible(
                'int add(int, int); int add(int left, int right) { return left + right; } |',
                'cpp'
            )[0].ambiguous
        ).toBeUndefined()
        expect(visible('int add(int); double add(double); |', 'cpp')[0].ambiguous).toBe(true)
    })
    it('keeps comments out of repeated type text and prototype identity', () => {
        expect(
            visible('const /* long comment */ int first, second; |').map((item) => item.declaration)
        ).toEqual(['const int second', 'const int first'])
        expect(
            visible('int add(int /* doc */); int add(int value) { return value; } |')[0].ambiguous
        ).toBeUndefined()
    })
    it('supports typedefs and aliases for parsing variable declarations without exporting types', () => {
        expect(names('typedef unsigned int Count; Count total; |')).toEqual(['total'])
        expect(names('using Count = unsigned int; Count total; |', 'cpp')).toEqual(['total'])
        expect(
            names('void first(void) { typedef int Hidden; } void second(void) { Hidden other; | }')
        ).toEqual(['second', 'first'])
    })
    it('keeps struct/class fields, namespace contents and template members out', () => {
        expect(names('struct Point { int field; }; struct Point point; |')).toEqual(['point'])
        expect(
            names(
                'class Point { int field; void method(int param); }; Point point; namespace inner { int hidden; } template<class T> T identity(T input) { return input; } |',
                'cpp'
            )
        ).toEqual(['point'])
    })
    it('does not index declarations in comments, strings, directives or arbitrary call arguments', () => {
        const text =
            '#define FAKE int phantom; \\\n int continued;\n// int comment;\n/* int block; */\nint real; void run(void) { consume("int fake;", R"x(int raw;)x"); consume(int invalid); | }'
        expect(names(text, 'cpp')).toEqual(['run', 'real'])
    })
    it('skips lambda internals while still recognizing the lambda variable', () => {
        expect(
            names(
                'void run(void) { auto callback = [](int argument) { int hidden; return argument; }; | }',
                'cpp'
            )
        ).toEqual(['callback', 'run'])
    })
    it.each(['{ | }', 'work(|);'])(
        'offers for initializer names only inside the loop: %s',
        (body) => {
            expect(
                names(`void run(void) { for (int index = 0; index < 4; ++index) ${body} }`)
            ).toContain('index')
            expect(
                names('void run(void) { for (int index = 0; index < 4; ++index) work(index); | }')
            ).not.toContain('index')
        }
    )
    it('keeps a declared loop variable visible in an unfinished control header', () => {
        expect(names('void run(void) { for (int index = 0; ind|')).toContain('index')
        expect(names('void run(void) { if (int result = read(); res|', 'cpp')).toContain('result')
    })
    it('handles range loops and C++ conditional declarations including else', () => {
        expect(
            names('int values[4]; void run(void) { for (int value : values) { | } }', 'cpp')
        ).toContain('value')
        expect(
            names('void run(void) { if (int result = read()) { } else { | } }', 'cpp')
        ).toContain('result')
        expect(
            names('void run(void) { if (int result = read()) { } else { } | }', 'cpp')
        ).not.toContain('result')
        expect(
            names('void run(void) { for (int index = 0; index < 4; ++index) { |', 'cpp')
        ).toContain('index')
    })
    it('handles labels and switch cases without consuming subsequent declarations', () => {
        expect(
            names('void run(void) { label: int total; switch (total) { case 1: int value; | } }')
        ).toEqual(['value', 'total', 'run'])
    })
    it('does not invent a named declaration from casts, returns or incomplete prototypes', () => {
        expect(names('void run(void) { (int)value; return value; | }')).toEqual(['run'])
        expect(names('int broken(int unfinished; |')).toEqual([])
    })
    it('shares immutable indexing by scan/version and bounds deeply nested blocks', () => {
        const source = scanSource('int value;')
        expect(indexSourceSymbols(source, 'c')).toBe(indexSourceSymbols(source, 'c'))
        const nested =
            'int global; void run(void) {' + '{'.repeat(128) + 'int hidden; |' + '}'.repeat(129)
        expect(names(nested)).toContain('global')
        expect(names(nested)).not.toContain('hidden')
    })
})
