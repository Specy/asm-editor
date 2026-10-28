import { describe, expect, it } from 'vite-plus/test'
import { M68KEmulator } from '#lib/languages/M68K/M68KEmulator.svelte.ts'
import { instructionsDocumentationList } from '#lib/languages/M68K/M68K-documentation.ts'

/**
 * Every M68K instruction page's example, which opens in an editor a reader can Build and Run, run
 * against the real Core. The program's code is memory it can overwrite, so an example that stores
 * into its own code would pause the reader's Run with a note ("The program wrote into its own
 * code"); none may, and none may end on an error but `illegal`'s, which is what it shows.
 */

const LIMIT = 100_000
/** What `trap`'s example reads with task 4, a number. */
const INPUT = ['42']
const ENDS_ON_AN_ERROR = new Set(['illegal'])

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
        async ({ name, code }) => {
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
                if (ENDS_ON_AN_ERROR.has(name)) expect(emulator.termination?.kind).toBe('error')
                else expect(emulator.errors).toEqual([])
            } finally {
                emulator.dispose()
            }
        }
    )
})
