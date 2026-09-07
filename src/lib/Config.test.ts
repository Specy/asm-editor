import { describe, expect, it } from 'vitest'
import { BASE_CODE } from '$lib/Config'
import { createEmulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'
import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * The default program of a new project, built and run against the real Cores, the way
 * `content/content.test.ts` gates every program a lecture shows.
 *
 * What this catches is a default that does not assemble, which is the live risk whenever these six
 * programs are edited together: they are the first assembly most readers of this app ever see, and
 * nothing else builds them.
 *
 * What it deliberately does not claim to catch is a default that ends badly. Measured against these
 * Cores, a program that runs off the end of its text segment and one that exits through its
 * environment's documented service are indistinguishable — both report `terminated`, no errors, and
 * the same status. Falling off the end is in fact how an M68K or Z80 program ends here. So the
 * exit idiom in each default is there to be read and copied, not because the suite can tell it
 * apart from its absence.
 */

const INSTRUCTION_LIMIT = 2_000_000
const EMULATOR_SETTINGS = {
    globalPageElementsPerRow: 4,
    globalPageSize: 4 * 8
}
const TIMEOUT = 180_000

/** `@specy/x86` wraps a Linux userland rather than a simulator, so it is not run under node —
 *  the same carve-out `content.test.ts` makes for x86 fences. */
const UNRUNNABLE: AvailableLanguages[] = ['X86']

const languages = Object.keys(BASE_CODE) as AvailableLanguages[]

describe('BASE_CODE', () => {
    it('covers every language', () => {
        expect(languages.length).toBeGreaterThan(0)
        for (const language of languages) {
            expect(BASE_CODE[language].trim().length, `${language} is empty`).toBeGreaterThan(0)
        }
    })

    for (const language of languages) {
        if (UNRUNNABLE.includes(language)) continue

        it(
            `${language} builds and ends`,
            async () => {
                const code = BASE_CODE[language]
                const emulator = await createEmulator(language, code, {
                    ...EMULATOR_SETTINGS,
                    language,
                    peripherals: { clock: new ProgramClock({ mode: 'virtual' }) }
                })
                try {
                    await emulator.compile(0, code)
                    emulator.peripherals.terminal.useScriptedInput([])
                    const status = await emulator.run(INSTRUCTION_LIMIT)

                    expect(emulator.errors, `${language} stopped with an error`).toEqual([])
                    expect(status).not.toBe(InterpreterStatus.TerminatedWithException)
                } finally {
                    emulator.dispose()
                }
            },
            TIMEOUT
        )
    }
})
