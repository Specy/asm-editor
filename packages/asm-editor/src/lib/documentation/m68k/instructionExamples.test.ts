import { describe, expect, it } from 'vite-plus/test'
import { M68KEmulator } from '#lib/languages/M68K/M68KEmulator.svelte.ts'
import { instructionsDocumentationList } from '#lib/languages/M68K/M68K-documentation.ts'
import { chapters } from './m68k'

/**
 * Every M68K instruction page's example, which opens in an editor a reader can Build and Run, run
 * against the real Core. The program's code is memory it can overwrite, so an example that stores
 * into its own code would pause the reader's Run with a note ("The program wrote into its own
 * code"); none may, and none may end on an error: an example of an exception (`chk`, `illegal`)
 * installs the handler that takes it.
 */

const LIMIT = 100_000
/** What `trap`'s example reads with task 4, a number. */
const INPUT = ['42']

/**
 * What a program's comments say it ends with: a data register's value, `d0 = 30`, the last such
 * claim on a line, and what it prints, `prints "two"`. A value is compared as the register's 32
 * bits, so `d1 = -2` is `$FFFFFFFE`.
 */
function expectWhatTheCommentsSay(emulator: ReturnType<typeof M68KEmulator>, code: string) {
    for (const [, register, value] of code.matchAll(/;.*\b(d[0-7]) = (-?\d+)\b/g)) {
        const held = emulator.registers.find(
            (candidate) => candidate.name === register.toUpperCase()
        )
        expect(held && BigInt.asUintN(32, held.value), register).toBe(
            BigInt.asUintN(32, BigInt(value))
        )
    }
    for (const [, text] of code.matchAll(/;.*\bprints "([^"]*)"/g)) {
        expect(emulator.stdOut).toContain(text)
    }
}

/** A program for a later processor, or for the bit fields, which opens by choosing it. */
const CHOOSES_ITS_PROCESSOR = /^\s*opt\s+(?:p=|bit\b)/i

const examples = instructionsDocumentationList.flatMap((instruction) =>
    instruction.interactiveExample
        ? [{ name: instruction.name, code: instruction.interactiveExample.code }]
        : []
)

describe('M68K instruction examples', () => {
    it('finds the examples', () => {
        expect(examples.length).toBeGreaterThan(50)
    })

    it.each(examples)(
        '$name builds and runs to its end without writing into its code',
        async ({ code }) => {
            const emulator = M68KEmulator(code)
            try {
                await emulator.compile(0, code)
                expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual(
                    []
                )
                emulator.peripherals.terminal.useScriptedInput(INPUT)
                await emulator.run(LIMIT)
                expect(emulator.notes).toEqual([])
                expect(emulator.terminated).toBe(true)
                expect(emulator.errors).toEqual([])
                //the 68010's and the 68020's, written since the examples say what they end with
                if (CHOOSES_ITS_PROCESSOR.test(code)) expectWhatTheCommentsSay(emulator, code)
            } finally {
                emulator.dispose()
            }
        }
    )
})

/**
 * Every whole program in the M68K Documentation's chapters, run as an instruction's example is: a
 * fence that opens by choosing its processor with `opt p=`, the 68010's and the 68020's, or the bit
 * fields with `opt bit`, plus the exception chapter's default-processor examples. What a comment says a data register ends up holding,
 * `d0 = 30`, and what it says the program prints, `prints "two"`, it must.
 */
const chapterPrograms = chapters().flatMap((chapter) =>
    chapter.entries.flatMap((entry) => {
        const markdown = entry.view.type === 'markdown' ? entry.view.markdown : ''
        return [...markdown.matchAll(/```m68k\n([\s\S]*?)```/g)]
            .map((fence) => fence[1])
            .filter((code) => CHOOSES_ITS_PROCESSOR.test(code) || chapter.id === 'exceptions')
            .map((code, index) => ({ name: `${entry.id} #${index + 1}`, code }))
    })
)

describe('M68K chapter examples', () => {
    it('finds the programs of the 68010 and the 68020', () => {
        const names = chapterPrograms.map(({ name }) => name)
        expect(names).toContain('m68k/exceptions/68010 #1')
        //the 68020's supervisor model: the master state's interrupt, a format $2 frame, and data
        //at an odd address
        expect(
            names.filter((name) =>
                /^m68k\/exceptions\/(?:throwaway-frame|68020-frames|odd-addresses) /.test(name)
            )
        ).toEqual([
            'm68k/exceptions/throwaway-frame #1',
            'm68k/exceptions/68020-frames #1',
            'm68k/exceptions/odd-addresses #1'
        ])
        expect(names.filter((name) => name.startsWith('m68k/addressing-modes/'))).toEqual([
            'm68k/addressing-modes/scaled-index #1',
            'm68k/addressing-modes/base-displacements #1',
            'm68k/addressing-modes/memory-indirect #1',
            'm68k/addressing-modes/memory-indirect #2',
            'm68k/addressing-modes/long-branches #1',
            'm68k/addressing-modes/register-pairs #1',
            //a program for the 68000, with `opt bit`
            'm68k/addressing-modes/bit-fields #1'
        ])
    })

    it.each(chapterPrograms)('$name builds and runs to its end', async ({ code }) => {
        const emulator = M68KEmulator(code)
        try {
            await emulator.compile(0, code)
            expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
            await emulator.run(LIMIT)
            expect(emulator.notes).toEqual([])
            expect(emulator.errors).toEqual([])
            //it ended, or paused on its `simhalt`, which the Core has just stepped past
            const lines = code.split('\n')
            const before = emulator.getSourceLocationFromAddress(emulator.pc - 4n)
            expect(
                emulator.terminated || lines[before?.line ?? -1]?.trim() === 'simhalt',
                'stops at its end'
            ).toBe(true)

            expectWhatTheCommentsSay(emulator, code)
        } finally {
            emulator.dispose()
        }
    })
})
