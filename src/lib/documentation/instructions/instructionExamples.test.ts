import { describe, expect, it } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { mipsInstructionNames } from '$lib/languages/MIPS/MIPS-documentation'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import {
    riscvInstructionNames,
    riscvInstructionMap
} from '$lib/languages/RISC-V/RISC-V-documentation'
import { mipsInstructionContent } from '$lib/documentation/mips/instructionContent'
import { mipsExampleExpectations } from '$lib/documentation/mips/exampleExpectations'
import { riscvInstructionContent } from '$lib/documentation/riscv/instructionContent'
import { riscvExampleExpectations } from '$lib/documentation/riscv/exampleExpectations'
import type { InstructionExampleExpectation } from './expectations'

const LIMIT = 2_000
const TIMEOUT = 300_000
type TargetContent = Record<
    string,
    { description?: string; example?: { target: string; code: string } }
>
type Expectations = Record<string, InstructionExampleExpectation>

function expectState(
    emulator: ReturnType<typeof MIPSEmulator>,
    expectation: InstructionExampleExpectation,
    name: string
) {
    for (const [register, value] of Object.entries(expectation.registers ?? {})) {
        const actual = emulator.registers.find((candidate) => candidate.name === register)
        expect(actual, `${name}: register ${register}`).toBeDefined()
        expect(
            BigInt.asUintN(Number(actual!.size) * 8, actual!.value),
            `${name}: register ${register}`
        ).toBe(BigInt(value))
    }
    for (const [fileId, registers] of Object.entries(expectation.registerFiles ?? {})) {
        const file = emulator.registerFiles.find((candidate) => candidate.id === fileId)
        expect(file, `${name}: register file ${fileId}`).toBeDefined()
        for (const [register, value] of Object.entries(registers)) {
            const actual = file!.registers.find((candidate) => candidate.name === register)
            expect(actual, `${name}: ${fileId}.${register}`).toBeDefined()
            expect(
                BigInt.asUintN(Number(actual!.size) * 8, actual!.value),
                `${name}: ${fileId}.${register}`
            ).toBe(BigInt(value))
        }
    }
    for (const [fileId, flags] of Object.entries(expectation.flags ?? {})) {
        const file = emulator.registerFiles.find((candidate) => candidate.id === fileId)
        expect(file, `${name}: flag file ${fileId}`).toBeDefined()
        for (const [flagName, value] of Object.entries(flags)) {
            const flag = file!.flags.find((candidate) => candidate.name === flagName)
            expect(flag, `${name}: ${fileId} flag ${flagName}`).toBeDefined()
            expect(BigInt(flag!.value), `${name}: ${fileId} flag ${flagName}`).toBe(BigInt(value))
        }
    }
    for (const { address, bytes } of expectation.memory ?? []) {
        expect(
            [...emulator.readMemoryBytes(BigInt(address), bytes.length)],
            `${name}: memory ${address}`
        ).toEqual(bytes)
    }
    if (expectation.output !== undefined)
        expect(emulator.stdOut, `${name}: output`).toBe(expectation.output)
}

function hasAuthoredMnemonic(code: string, name: string): boolean {
    return code.split(/\r?\n/).some((line) => {
        const source = line.split('#', 1)[0].trim()
        const instruction = source.replace(/^(?:[A-Za-z_.$][\w.$]*:\s*)+/, '').trim()
        return instruction.split(/[\s,]+/, 1)[0]?.toLowerCase() === name.toLowerCase()
    })
}

function validateRegistry(
    names: string[],
    content: TargetContent,
    expectations: Expectations,
    language: 'mips' | 'riscv'
) {
    const label = language.toUpperCase()
    expect(Object.keys(content).sort(), `${label}: exact mnemonic coverage`).toEqual(
        [...names].sort()
    )
    expect(Object.keys(expectations).sort(), `${label}: expectation coverage`).toEqual(
        [...names].sort()
    )
    for (const name of names) {
        const item = content[name]
        expect(item, `${label} ${name}`).toBeDefined()
        expect(item.example?.code.trim(), `${label} ${name}: source`).toBeTruthy()
        if (language === 'riscv' && name === 'wfi') {
            const lines = item.example!.code.split(/\r?\n/).map((line) => line.trim())
            expect(lines, 'RISC-V wfi: opt-in instruction stays commented').toContain('# wfi')
            expect(
                lines.some((line) => line.startsWith('#') && /wait/i.test(line)),
                'RISC-V wfi: explain that the instruction waits'
            ).toBe(true)
        } else {
            expect(
                hasAuthoredMnemonic(item.example!.code, name),
                `${label} ${name}: named instruction appears in source`
            ).toBe(true)
        }
        expect(item.description, `${label} ${name}: rich description deferred`).toBeUndefined()
        const expected = expectations[name]
        expect(expected, `${label} ${name}: expectation`).toBeDefined()
        expect(
            Object.keys(expected).some((key) => key !== 'stop' && key !== 'error') ||
                expected.stop !== undefined,
            `${label} ${name}: observable result expectation`
        ).toBe(true)
        if (language === 'riscv') {
            const rv64Only = riscvInstructionMap.get(name)?.[0]?.isRv64Only
            if (rv64Only) {
                expect(item.example?.target, `${label} ${name}: RV64-only instruction target`).toBe(
                    'RISC-V-64'
                )
            } else {
                expect(item.example?.target, `${label} ${name}: target`).toMatch(/^RISC-V(-64)?$/)
            }
        } else {
            expect(item.example?.target, `${label} ${name}: target`).toBe('MIPS')
        }
    }
}

async function executeTarget(
    language: 'mips' | 'riscv',
    content: TargetContent,
    expectations: Expectations
): Promise<string[]> {
    const failures: string[] = []
    const examples = Object.entries(content).sort(([a], [b]) => a.localeCompare(b))
    const first = examples[0]
    if (!first?.[1].example) throw new Error(`${language}: no examples to execute`)
    const languageTarget = language === 'mips' ? 'MIPS' : first[1].example.target
    const factory = language === 'mips' ? MIPSEmulator : RISCVEmulator
    const emulator = factory(first[1].example.code, {
        automaticChecking: false,
        language: languageTarget as 'MIPS' | 'RISC-V' | 'RISC-V-64'
    })
    try {
        for (const [name, item] of examples) {
            const example = item.example!
            // RISC-V's Core width is module-global, so each compile/run pair stays serial.
            try {
                await emulator.compile(0, example.code)
                expect(emulator.errors, `${language} ${name}: build errors`).toEqual([])
                emulator.peripherals.terminal.useScriptedInput([])
                await emulator.run(LIMIT)
                const expected = expectations[name]
                const errors = emulator.errors
                if (expected.stop === 'breakpoint') {
                    expect(errors, `${language} ${name}: intentional breakpoint errors`).toEqual([])
                    expect(
                        emulator.terminated,
                        `${language} ${name}: breakpoint pauses execution`
                    ).toBe(false)
                } else if (expected.stop === 'exception') {
                    expect(
                        errors.length,
                        `${language} ${name}: intentional exception`
                    ).toBeGreaterThan(0)
                    if (expected.error)
                        expect(errors.join('\n'), `${language} ${name}: expected error`).toMatch(
                            new RegExp(expected.error, 'i')
                        )
                } else {
                    expect(errors, `${language} ${name}: incidental runtime errors`).toEqual([])
                }
                if (!expected.stop) {
                    expect(emulator.terminated, `${language} ${name}: finite completion`).toBe(true)
                }
                expectState(
                    emulator as ReturnType<typeof MIPSEmulator>,
                    expected,
                    `${language} ${name}`
                )
            } catch (error) {
                failures.push(`${language} ${name}: ${(error as Error).message}`)
            }
        }
    } finally {
        emulator.dispose()
    }
    return failures
}

function optionalOverflowBlock(code: string, name: string): string {
    const start = `# Optional overflow variation:`
    const expectedMarker = '# Expected: signed integer overflow stops execution.'
    const lines = code.split(/\r?\n/)
    const startIndex = lines.findIndex((line) => line.startsWith(start))
    if (startIndex < 0) throw new Error(`MIPS ${name}: missing marked optional overflow block`)
    const endIndex = lines.findIndex((line, index) => index > startIndex && line === expectedMarker)
    if (endIndex < 0)
        throw new Error(`MIPS ${name}: optional overflow block has no expected-outcome marker`)
    const instructions = lines
        .slice(startIndex + 1, endIndex)
        .map((line) => {
            if (!line.startsWith('# '))
                throw new Error(`MIPS ${name}: optional block contains an unmarked line`)
            return line.slice(2)
        })
        .filter((line) => line.trim().length > 0)
    if (instructions.length === 0) throw new Error(`MIPS ${name}: optional overflow block is empty`)
    return instructions.join('\n')
}

async function executeOptionalOverflowExamples(): Promise<string[]> {
    const failures: string[] = []
    const emulator = MIPSEmulator('', { automaticChecking: false, language: 'MIPS' })
    try {
        for (const name of ['add', 'addi']) {
            try {
                const code = mipsInstructionContent[name]?.example?.code
                expect(code, `MIPS ${name}: optional fault source`).toBeDefined()
                const block = optionalOverflowBlock(code!, name)
                await emulator.compile(0, `${code}\n${block}\n`)
                expect(emulator.errors, `MIPS ${name}: optional fault builds cleanly`).toEqual([])
                emulator.peripherals.terminal.useScriptedInput([])
                await emulator.run(LIMIT)
                expect(
                    emulator.errors.length,
                    `MIPS ${name}: intentional overflow fault`
                ).toBeGreaterThan(0)
                expect(emulator.errors.join('\n'), `MIPS ${name}: overflow error`).toMatch(
                    /overflow/i
                )
            } catch (error) {
                failures.push(`MIPS ${name} optional overflow: ${(error as Error).message}`)
            }
        }
    } finally {
        emulator.dispose()
    }
    return failures
}

describe('authored MIPS and RISC-V instruction examples', () => {
    it('covers every documented mnemonic with a focused source and a separate expected result', () => {
        validateRegistry(
            mipsInstructionNames,
            mipsInstructionContent,
            mipsExampleExpectations,
            'mips'
        )
        validateRegistry(
            riscvInstructionNames,
            riscvInstructionContent,
            riscvExampleExpectations,
            'riscv'
        )
    })

    it(
        'builds, runs, and checks every default example on its declared Target',
        async () => {
            const failures = await executeTarget(
                'mips',
                mipsInstructionContent,
                mipsExampleExpectations
            )
            // RV64 examples are executed in a second sweep below because XLEN is fixed per adapter.
            const rv32 = Object.fromEntries(
                Object.entries(riscvInstructionContent).filter(
                    ([, item]) => item.example?.target === 'RISC-V'
                )
            )
            const rv64 = Object.fromEntries(
                Object.entries(riscvInstructionContent).filter(
                    ([, item]) => item.example?.target === 'RISC-V-64'
                )
            )
            failures.push(...(await executeTarget('riscv', rv32, riscvExampleExpectations)))
            failures.push(...(await executeTarget('riscv', rv64, riscvExampleExpectations)))
            expect(
                failures,
                'all authored examples build and produce their stated results'
            ).toEqual([])
        },
        TIMEOUT
    )

    it(
        'raises the intentional signed overflow in the marked MIPS add/addi variations',
        async () => {
            const failures = await executeOptionalOverflowExamples()
            expect(failures, 'marked MIPS overflow variations').toEqual([])
        },
        TIMEOUT
    )
})
