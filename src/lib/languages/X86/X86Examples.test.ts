import { describe, expect, it } from 'vitest'
import { buildX86Example } from '../../../routes/documentation/x86/instruction/[instructionName]/example'
import { x86DocumentedNames } from './X86-documentation'
import { X86Emulator } from './X86Emulator.svelte'

/**
 * Every program the x86 instruction pages start their editor with, assembled by the real assembler.
 *
 * They are generated from the instruction table rather than written by hand, so nothing but this
 * catches a form filled with an operand NASM rejects. A reader who opens a page and finds an error
 * marker in the editor learns the wrong lesson, so the bar is that all of them assemble.
 */

const TIMEOUT = 300_000

function sourcesFor(code: string) {
    return {
        entry: 'main.asm',
        files: { 'main.asm': { encoding: 'plain' as const, content: code } }
    }
}

describe('x86 instruction page examples', () => {
    const examples = x86DocumentedNames
        .map((name) => ({ name, code: buildX86Example(name) }))
        .filter((example): example is { name: string; code: string } => example.code !== null)

    it('shows a program for most of the documented instruction set', () => {
        expect(examples.length / x86DocumentedNames.length).toBeGreaterThan(0.8)
        // The ones without a program are the instructions long mode dropped (`aaa`, `pusha`), the
        // ones that stop the program (`int3`, `hlt`), and the 16 bit address size loops.
        for (const name of ['add', 'mov', 'lea', 'jne', 'setg', 'cmovg', 'loop', 'movsb', 'call']) {
            expect(buildX86Example(name), name).not.toBeNull()
        }
        expect(buildX86Example('aaa')).toBeNull()
        expect(buildX86Example('int3')).toBeNull()
    })

    it('writes programs that end, and end through the exit syscall', () => {
        for (const example of examples) {
            expect(example.code, example.name).toContain('mov rax, 60')
            expect(example.code, example.name).toMatch(/syscall\s*$/)
        }
    })

    it(
        'runs the ones with something to set up',
        async () => {
            // Assembling proves the line is legal; running proves the setup around it is. These are
            // the programs that touch memory, jump, or call, which is where a generated program
            // that assembles can still fault.
            const names = [
                'syscall',
                'call',
                'loop',
                'movsb',
                'stosb',
                'xlatb',
                'div',
                'idiv',
                'enter',
                'lea',
                'jne',
                'cmpxchg'
            ]
            const first = sourcesFor(buildX86Example(names[0])!)
            const emulator = await X86Emulator(first, { automaticChecking: false })
            try {
                for (const name of names) {
                    const code = buildX86Example(name)
                    expect(code, name).not.toBeNull()
                    const sources = sourcesFor(code!)
                    await emulator.compile(20, sources)
                    expect(emulator.errors, name).toEqual([])
                    await emulator.run(100_000)
                    expect(emulator.errors, name).toEqual([])
                }
                // The one example that prints: it is also the page a reader most likely runs first.
                await emulator.compile(20, sourcesFor(buildX86Example('syscall')!))
                await emulator.run(100_000)
                expect(emulator.stdOut).toContain('hello, world')
            } finally {
                emulator.dispose()
            }
        },
        TIMEOUT
    )

    it(
        'assembles every one of them',
        async () => {
            // One emulator for the whole sweep: starting it costs more than a compile does.
            const emulator = await X86Emulator(sourcesFor(examples[0].code), {
                automaticChecking: false
            })
            try {
                const broken: string[] = []
                for (const example of examples) {
                    const sources = sourcesFor(example.code)
                    // A failed build throws rather than only filling `errors`, and one broken
                    // example must not hide the rest.
                    try {
                        await emulator.compile(20, sources)
                        if (emulator.errors.length > 0) {
                            broken.push(`${example.name}: ${JSON.stringify(emulator.errors)}`)
                        }
                    } catch (error) {
                        broken.push(`${example.name}: ${(error as Error).message.split('\n')[0]}`)
                    }
                }
                expect(broken).toEqual([])
            } finally {
                emulator.dispose()
            }
        },
        TIMEOUT
    )
})
