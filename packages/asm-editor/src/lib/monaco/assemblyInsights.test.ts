import { describe, expect, it } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'
import {
    createBuildArtifactHoverProvider,
    createNumericHoverProvider,
    numberMarkdown,
    setModelBuildArtifacts
} from './assemblyInsights'

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = { Range } as unknown as MonacoType

function model(line: string, uri = 'asm-editor://project/session/build/1/main.asm') {
    return {
        uri: { toString: () => uri },
        getLineContent: () => line
    }
}

function position(line: string, text: string, lineNumber = 1) {
    return { lineNumber, column: line.indexOf(text) + 1 }
}

function markdown(result: monaco.languages.Hover | null | undefined) {
    if (!result) return ''
    return result.contents.map((content) => content.value).join('\n')
}

describe('assembly numeric hovers', () => {
    it('shows signed, unsigned and alternate bases only while hovering the literal', async () => {
        const provider = createNumericHoverProvider(monacoStub, {
            bits: 32,
            comment: ';',
            dialect: 'm68k'
        })
        const line = 'move.l #-1,d0 ; 42'
        const result = await provider.provideHover?.(
            model(line) as never,
            position(line, '-1') as never,
            {} as never
        )

        expect(markdown(result)).toContain('Signed: `-1`')
        expect(markdown(result)).toContain('Unsigned: `4294967295`')
        expect(markdown(result)).toContain('Hexadecimal: `0xffffffff`')

        const comment = '    * 99 is a full-line M68K comment'
        expect(
            await provider.provideHover?.(
                model(comment) as never,
                position(comment, '99') as never,
                {} as never
            )
        ).toBeNull()
        expect(
            await provider.provideHover?.(
                model(line) as never,
                position(line, 'd0') as never,
                {} as never
            )
        ).toBeNull()
    })

    it('understands M68K octal literals', async () => {
        const provider = createNumericHoverProvider(monacoStub, {
            bits: 32,
            comment: ';',
            dialect: 'm68k'
        })
        const line = 'moveq #@17,d0'
        const result = await provider.provideHover?.(
            model(line) as never,
            position(line, '@17') as never,
            {} as never
        )

        expect(markdown(result)).toContain('Decimal: `15`')
        expect(markdown(result)).toContain('Hexadecimal: `0xf`')
    })

    it('understands dialect forms and ignores registers and quoted text', async () => {
        const mips = createNumericHoverProvider(monacoStub, {
            bits: 32,
            comment: '#',
            dialect: 'mips'
        })
        const mipsLine = 'addi $t0, $zero, 10 # 20'
        expect(
            markdown(
                await mips.provideHover?.(
                    model(mipsLine) as never,
                    position(mipsLine, '10') as never,
                    {} as never
                )
            )
        ).toContain('Hexadecimal: `0xa`')
        expect(
            await mips.provideHover?.(
                model(mipsLine) as never,
                position(mipsLine, '20') as never,
                {} as never
            )
        ).toBeNull()

        const octalLine = 'addi $t0, $zero, 010'
        expect(
            markdown(
                await mips.provideHover?.(
                    model(octalLine) as never,
                    position(octalLine, '010') as never,
                    {} as never
                )
            )
        ).toContain('Decimal: `8`')

        const z80 = createNumericHoverProvider(monacoStub, {
            bits: 16,
            comment: ';',
            dialect: 'z80'
        })
        const z80Line = 'db "10", 0ffh, %1010'
        expect(
            markdown(
                await z80.provideHover?.(
                    model(z80Line) as never,
                    position(z80Line, '0ffh') as never,
                    {} as never
                )
            )
        ).toContain('Decimal: `255`')
        expect(
            await z80.provideHover?.(
                model(z80Line) as never,
                position(z80Line, '%1010') as never,
                {} as never
            )
        ).toMatchObject({ range: expect.objectContaining({ startColumn: 16 }) })
    })
})

describe('a number read as text', () => {
    it("reads its bytes in the Target's order, as many as the value needs", async () => {
        const x86 = createNumericHoverProvider(monacoStub, {
            bits: 64,
            comment: ';',
            dialect: 'x86'
        })
        const line = 'mov rax, 0x4c75257240343a41'
        const card = markdown(
            await x86.provideHover?.(
                model(line) as never,
                position(line, '0x4c') as never,
                {} as never
            )
        )
        expect(card).toContain('Hexadecimal: `0x4c75257240343a41`')
        expect(card).toContain('- Text: `A:4@r%uL`')
        //the 68000 keeps a number's bytes big-endian
        const m68k = createNumericHoverProvider(monacoStub, {
            bits: 32,
            comment: ';',
            dialect: 'm68k'
        })
        const move = 'move.l #$41424344,d0'
        expect(
            markdown(
                await m68k.provideHover?.(
                    model(move) as never,
                    position(move, '$41') as never,
                    {} as never
                )
            )
        ).toContain('- Text: `ABCD`')
        expect(numberMarkdown(0x41424344n, 32)).toContain('- Text: `DCBA`')
        expect(numberMarkdown(0x6948n, 16, 'little')).toContain('- Text: `Hi`')
    })

    it('has none for one byte, an unprintable byte, a negative value or spaces alone', () => {
        for (const value of [0x41n, 0x410an, 0x4100_4142n, -0x4142n, 0x2020n])
            expect(numberMarkdown(value, 64)).not.toContain('Text')
        //a fence longer than any backticks the text holds, padded where they touch it
        expect(numberMarkdown(0x6060_41n, 32)).toContain('- Text: ``` A`` ```')
        expect(numberMarkdown(0x41_2041n, 32)).toContain('- Text: `A A`')
    })
})

describe('assembly Build hovers', () => {
    const operationSpan = (line: string) => {
        const start = line.indexOf('move')
        return start < 0 ? undefined : { start, end: start + 4 }
    }

    it('shows emitted addresses and opcodes only on the instruction mnemonic', async () => {
        const uri = 'asm-editor://project/session/build/1/lib.asm'
        const line = '    move d0,d1'
        const clear = setModelBuildArtifacts(uri, [
            { file: 'lib.asm', line: 2, address: 0x1000n, opcode: '70 01' },
            { file: 'lib.asm', line: 2, address: 0x1002n, opcode: '4e 75' }
        ])
        try {
            const provider = createBuildArtifactHoverProvider(monacoStub, operationSpan)
            const result = await provider.provideHover?.(
                model(line, uri) as never,
                position(line, 'move', 3) as never,
                {} as never
            )
            expect(markdown(result)).toContain('Address `0x1000` Machine code `70 01`')
            expect(markdown(result)).toContain('Address `0x1002` Machine code `4e 75`')
            expect(
                await provider.provideHover?.(
                    model(line, uri) as never,
                    position(line, 'd0', 3) as never,
                    {} as never
                )
            ).toBeNull()
        } finally {
            clear()
        }
    })

    it('does not let an obsolete editor cleanup remove newer Build data', async () => {
        const uri = 'asm-editor://project/session/build/1/main.asm'
        const line = 'move d0,d1'
        const clearOld = setModelBuildArtifacts(uri, [
            { file: 'main.asm', line: 0, address: 0x1000n, opcode: 'aa' }
        ])
        const clearCurrent = setModelBuildArtifacts(uri, [
            { file: 'main.asm', line: 0, address: 0x1002n, opcode: 'bb' }
        ])
        clearOld()
        try {
            const result = await createBuildArtifactHoverProvider(
                monacoStub,
                operationSpan
            ).provideHover?.(
                model(line, uri) as never,
                position(line, 'move') as never,
                {} as never
            )
            expect(markdown(result)).toContain('Address `0x1002` Machine code `bb`')
            expect(markdown(result)).not.toContain('0x1000')
        } finally {
            clearCurrent()
        }
    })
})
