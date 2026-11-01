import { describe, expect, it } from 'vite-plus/test'
import { loadDemangler } from './demangle/loadDemangler'
import {
    escapeText,
    programSymbols,
    type CoreLabel,
    type LabelDefinition,
    type ProgramSymbolsInput
} from './programSymbols'
import type { BuildSources } from '#lib/projectFiles.ts'

/**
 * What the Symbols panel lists of a program the editor built
 * ([workbench.md](../../../../../docs/design/workbench.md), Symbols in every Target), from what a
 * Core reports, over a fake memory: which labels, how far each goes, where each is defined, and
 * which hold text.
 */

const plain = (content: string) => ({ encoding: 'plain' as const, content })

/** Memory of `bytes` from `base`, zero elsewhere, as a Core reads it. */
function memory(base: bigint, bytes: number[]) {
    return (address: bigint, length: bigint) =>
        Uint8Array.from({ length: Number(length) }, (_, i) => {
            const offset = Number(address - base) + i
            return offset >= 0 && offset < bytes.length ? bytes[offset] : 0
        })
}

const text = (value: string) => [...new TextEncoder().encode(value)]

function symbols(
    labels: CoreLabel[],
    {
        sources = { entry: 'main.s', files: {} },
        read = memory(0n, []),
        locate = () => null,
        colonless = false
    }: {
        sources?: BuildSources
        read?: ProgramSymbolsInput['read']
        locate?: (address: bigint) => LabelDefinition | null
        colonless?: boolean
    } = {}
) {
    return programSymbols({
        labels,
        sections: [
            { name: '.text', runs: [{ start: 0x100n, length: 0x40n, kind: 'code' }] },
            { name: '.data', runs: [{ start: 0x1000n, length: 0x100n, kind: 'data' }] }
        ],
        sources,
        syntax: { comment: colonless ? ';' : '#', colonless },
        locate,
        read
    })
}

const label = (name: string, address: number, extra: Partial<CoreLabel> = {}): CoreLabel => ({
    name,
    address: BigInt(address),
    fromLibrary: false,
    ...extra
})

describe('the labels', () => {
    it('lists the program’s own, in address order, each to the next, a library’s or its run’s end', () => {
        const { labels } = symbols([
            label('table', 0x1010),
            label('main', 0x100),
            label('printf', 0x120, { fromLibrary: true }),
            label('loop', 0x108),
            label('alias', 0x108),
            label('past', 0x2000)
        ])
        expect(labels.map((each) => [each.name, each.kind, each.size])).toEqual([
            ['main', 'code', 8n],
            //up to printf, which is not listed
            ['alias', 'code', 0x18n],
            ['loop', 'code', 0x18n],
            ['table', 'data', 0xf0n],
            //outside every run, which nothing says the size of
            ['past', 'data', 0n]
        ])
    })

    it('leaves out the labels a compiler makes for itself, and demangles a C++ name', async () => {
        await loadDemangler()
        const sources = {
            entry: 'main.c',
            files: {},
            compiledLanguages: { 'main.c.s': 'cpp' as const }
        }
        const { labels } = symbols(
            [
                label('_Z3addii', 0x100, { file: 'main.c.s' }),
                label('.L3', 0x110, { file: 'main.c.s' }),
                label('$L4', 0x114, { file: 'main.c.s' }),
                label('.LC0', 0x1000, { file: 'main.c.s' }),
                //written by hand, where a `.L` is the person's own
                label('.Lmine', 0x1010, { file: 'helpers.s' })
            ],
            { sources }
        )
        expect(labels.map((each) => [each.name, each.display, each.size])).toEqual([
            ['_Z3addii', 'add(int, int)', 0x40n],
            ['.Lmine', '.Lmine', 0xf0n]
        ])
    })
})

describe('where a label is defined', () => {
    const sources = {
        entry: 'main.s',
        files: {
            'main.s': plain(
                [
                    '.data',
                    'first: second: .word 1  # two labels',
                    '# third: is only a comment',
                    'third: .word 2',
                    '.include "more.s"',
                    '.text',
                    'main:',
                    '    nop'
                ].join('\n')
            ),
            'more.s': plain('fourth: .asciiz "hi"'),
            'other.s': plain('fourth: .word 9')
        }
    }

    it('takes the line the Core gives, else finds the label in its File and those it includes', () => {
        const { labels } = symbols(
            [
                label('given', 0x1030, { file: 'other.s', line: 0 }),
                label('second', 0x1000, { file: 'main.s' }),
                label('third', 0x1004, { file: 'main.s' }),
                label('fourth', 0x1008, { file: 'main.s' }),
                label('missing', 0x100c, { file: 'main.s' })
            ],
            { sources }
        )
        expect(labels.map((each) => [each.name, each.definition])).toEqual([
            ['second', { file: 'main.s', line: 1 }],
            ['third', { file: 'main.s', line: 3 }],
            ['fourth', { file: 'more.s', line: 0 }],
            ['missing', undefined],
            ['given', { file: 'other.s', line: 0 }]
        ])
    })

    it('finds a code label at its own line above the instruction it marks', () => {
        const { labels } = symbols([label('main', 0x100)], {
            sources,
            locate: () => ({ file: 'main.s', line: 7 })
        })
        expect(labels[0].definition).toEqual({ file: 'main.s', line: 6 })
    })

    it('finds a NASM label without its colon, and a local label below its global', () => {
        const nasm = {
            entry: 'main.asm',
            files: {
                'main.asm': plain(
                    [
                        'section .data',
                        'msg db "Hello", 0',
                        'msglen equ $ - msg',
                        'table:',
                        '.entry dq 1',
                        'other:',
                        '.entry: dq 2',
                        'section .text',
                        'msg2 mov rax, 1'
                    ].join('\n')
                )
            }
        }
        const { labels } = symbols(
            [
                label('msg', 0x1000, { file: 'main.asm' }),
                label('table.entry', 0x1008, { file: 'main.asm' }),
                label('other.entry', 0x1010, { file: 'main.asm' }),
                label('msg2', 0x1018, { file: 'main.asm' })
            ],
            { sources: nasm, colonless: true }
        )
        expect(labels.map((each) => [each.name, each.definition?.line])).toEqual([
            ['msg', 1],
            ['table.entry', 4],
            ['other.entry', 6],
            //a name before an instruction is no label NASM would make
            ['msg2', undefined]
        ])
    })
})

describe('the strings', () => {
    function stringsOf(bytes: number[], labels: CoreLabel[]) {
        return symbols(labels, { read: memory(0x1000n, bytes) }).strings.map((string) => [
            string.label,
            string.text
        ])
    }

    it('reads the text at a data label up to its NUL', () => {
        const bytes = [...text('Hello, world\n'), 0, ...text('Bye'), 0]
        expect(stringsOf(bytes, [label('hello', 0x1000), label('bye', 0x100e)])).toEqual([
            ['hello', 'Hello, world\n'],
            ['bye', 'Bye']
        ])
    })

    it('reads text with no NUL up to the next label', () => {
        const bytes = [...text('no nul'), 0xff, 0xff]
        expect(stringsOf(bytes, [label('ascii', 0x1000), label('next', 0x1006)])).toEqual([
            ['ascii', 'no nul']
        ])
    })

    it('takes UTF-8 and terminal escapes, and nothing a number would hold', () => {
        const bytes = [
            ...text('café'),
            0,
            ...[0x1b, ...text('[2J')],
            0,
            ...[0x0a, 0, 0, 0],
            ...[0x20, 0x20, 0, 0],
            ...[0x48, 0x69, 0x80, 0],
            ...[0x01, 0x48, 0x69, 0],
            ...[0xc3, 0x28, 0x41, 0]
        ]
        const labels = [
            label('accent', 0x1000),
            label('clear', 0x1006),
            label('newline', 0x100b),
            label('spaces', 0x100f),
            label('highBit', 0x1013),
            label('control', 0x1017),
            label('notUtf8', 0x101b)
        ]
        expect(stringsOf(bytes, labels)).toEqual([
            ['accent', 'café'],
            ['clear', '\x1b[2J']
        ])
    })

    it('reads no code, and a compiler’s string constant by the label a person gave it', () => {
        const bytes = [...text('Hi there'), 0]
        const read = memory(0x100n, bytes)
        const sources = {
            entry: 'main.c',
            files: {},
            compiledLanguages: { 'main.c.s': 'c' as const }
        }
        const result = symbols(
            [
                label('code', 0x100),
                label('.LC0', 0x1000, { file: 'main.c.s' }),
                label('greeting', 0x1000, { file: 'main.c.s' })
            ],
            {
                sources,
                read: (address, length) =>
                    address >= 0x1000n
                        ? memory(0x1000n, bytes)(address, length)
                        : read(address, length)
            }
        )
        expect(result.strings.map((string) => [string.label, string.text])).toEqual([
            ['greeting', 'Hi there']
        ])
        expect(
            symbols([label('.LC0', 0x1000, { file: 'main.c.s' })], {
                sources,
                read: memory(0x1000n, bytes)
            }).strings.map((string) => string.label)
        ).toEqual(['.LC0'])
    })

    it('is left out where memory cannot be read', () => {
        const result = symbols([label('hello', 0x1000)], {
            read: () => {
                throw new Error('unmapped')
            }
        })
        expect(result.strings).toEqual([])
    })

    it('escapes what a C string literal would', () => {
        expect(escapeText('a\tb\n"c"\\\x1b\rcafé')).toBe('a\\tb\\n\\"c\\"\\\\\\x1b\\rcafé')
    })
})
