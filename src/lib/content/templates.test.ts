import { describe, expect, it } from 'vitest'
import { getProjectTemplates } from '$lib/content/templates'
import { createEmulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'
import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * Every program the create page offers, built and run against the real Cores.
 *
 * The Course Examples behind most of these are already gated by `content/content.test.ts`, but not
 * as templates: this is what catches a `template` key on a page whose first fence is in another
 * language, an RV32 program offered to RISC-V-64 that does not assemble as RV64, and the hand
 * written x86 set, which has no Course and so no other cover.
 */

const INSTRUCTION_LIMIT = 2_000_000
const EMULATOR_SETTINGS = { globalPageElementsPerRow: 4, globalPageSize: 4 * 8 }
const TIMEOUT = 180_000

/** Enough for any template that reads: two numbers for a sum, a line for an echo. */
const SCRIPTED_INPUT = ['12', '30', 'hello', '1', '2']

/** Programs that loop until the reader presses Stop, as their lecture's `runFor` says. */
const RUNS_FOREVER = new Set(['drawing-on-the-screen'])

const templates = await getProjectTemplates()
const languages = Object.keys(templates) as AvailableLanguages[]

describe('project templates', () => {
    it('offers every language a barebones entry first', () => {
        for (const language of languages) {
            expect(templates[language].length, `${language} has no templates`).toBeGreaterThan(0)
            expect(templates[language][0].id, `${language} does not start with barebones`).toBe(
                'barebones'
            )
        }
    })

    it('labels every template with the language it is offered for', () => {
        for (const language of languages) {
            for (const template of templates[language]) {
                expect(template.language, `${template.id} in ${language}`).toBe(language)
                expect(template.code.trim().length, `${template.id} is empty`).toBeGreaterThan(0)
                expect(template.name.length, `${template.id} has no name`).toBeGreaterThan(0)
            }
        }
    })

    for (const language of languages) {
        describe(language, () => {
            for (const template of templates[language]) {
                it(
                    `${template.id} builds and runs`,
                    async () => {
                        const emulator = await createEmulator(language, template.code, {
                            ...EMULATOR_SETTINGS,
                            language,
                            peripherals: { clock: new ProgramClock({ mode: 'virtual' }) }
                        })
                        try {
                            await emulator.compile(0, template.code)
                            emulator.peripherals.terminal.useScriptedInput([...SCRIPTED_INPUT])
                            const status = await emulator.run(INSTRUCTION_LIMIT)
                            if (RUNS_FOREVER.has(template.id)) return
                            expect(emulator.errors, `${template.id} stopped with an error`).toEqual(
                                []
                            )
                            expect(status).not.toBe(InterpreterStatus.TerminatedWithException)
                        } finally {
                            emulator.dispose()
                        }
                    },
                    TIMEOUT
                )
            }
        })
    }
})
