import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractPlaygrounds, type ContentPlayground } from '$lib/content/playgrounds'
import { createEmulator, type Emulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'
import type { Testcase, TestcaseValidationError } from '$lib/Project.svelte'

/**
 * Every program a course page shows a reader, built and run against the real Cores the app ships.
 * A lecture is where a beginner meets assembly, so a playground that does not assemble, or that
 * stops with a runtime error, is worse than no lecture at all; this is the gate the course plan
 * (`docs/courses/plan.md`) puts in front of the content.
 *
 * What is checked, page by page and fence by fence:
 *
 * - every playground builds and runs to its end, or for the `runFor` instructions its `testcase`
 *   fence declares, which is how a program that loops until Stop says so;
 * - a program that reads input takes it from the `testcase` fence's `input`, and one that asks for
 *   input nobody declared fails, naming the page and the fence;
 * - every `exercise` has a testcase and a `solution`, the solution passes the testcase and the
 *   skeleton does not.
 *
 * The fences themselves are read by `playgrounds.ts`, the same module the renderer parses them
 * with, so what runs here is what a reader gets.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const CONTENT = join(ROOT, 'src', 'content')

/**
 * The embed's own defaults, from `settingsStore.svelte.ts` and from the `EmulatorLoader` the embed
 * page mounts: a run stops after two million instructions, and the memory panel pages in 32 bytes.
 * Everything else (the base address, the memory size, the stack) is the language default, which is
 * what an embed with no project behind it gets.
 */
const INSTRUCTION_LIMIT = 2_000_000
const EMULATOR_SETTINGS = {
    globalPageElementsPerRow: 4,
    globalPageSize: 4 * 8
}

/** A Core takes a while to boot under node, and a long program takes longer than vitest's default. */
const TIMEOUT = 180_000

/** How the M68K Core says "the budget I was given ran out", through `M68kUtils.ts`. */
const EXECUTION_LIMIT = /execution limit of/i

/**
 * x86 has no course and no documentation pages yet (`docs/courses/plan.md`, decision 1: its syntax
 * is undecided), and `@specy/x86` wraps a Linux userland rather than a simulator, so a fence in that
 * language is reported and left unrun instead of failing the suite.
 */
const UNRUNNABLE = {
    X86: '@specy/x86 wraps a Linux userland and x86 has no course yet'
} as Partial<Record<string, string>>

type ContentPage = {
    /** Relative to the repository root, which is how a failure names it. */
    path: string
    playgrounds: ContentPlayground[]
    /** Set when the page's fences could not be read at all. */
    error?: string
}

function markdownFiles(directory: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry)
        if (statSync(path).isDirectory()) found.push(...markdownFiles(path))
        else if (entry.endsWith('.md')) found.push(path)
    }
    return found
}

function contentPages(): ContentPage[] {
    return markdownFiles(CONTENT)
        .sort()
        .map((path) => {
            const relativePath = relative(ROOT, path)
            try {
                return {
                    path: relativePath,
                    playgrounds: extractPlaygrounds(readFileSync(path, 'utf8'))
                }
            } catch (e) {
                return { path: relativePath, playgrounds: [], error: (e as Error).message }
            }
        })
}

/** How a failure names one fence: the page has several and they are told apart by order. */
function nameOf(playground: ContentPlayground): string {
    return `playground ${playground.index} (line ${playground.line}, \`${playground.info}\`)`
}

/**
 * A fresh Emulator per playground, configured like the embed's. The clock is virtual so a program
 * that waits for a frame does not make the suite sleep, exactly as a Testcase run does
 * ([ADR 0010](../../../docs/adr/0010-program-time-without-clock-pacing.md)).
 */
async function emulatorFor(playground: ContentPlayground): Promise<Emulator> {
    return await createEmulator(playground.settings.language, playground.code, {
        ...EMULATOR_SETTINGS,
        //the RISC-V adapter reads its word size off `options.language`, the way EmulatorLoader passes
        //it, so without this every riscv64 fence would be assembled by the 32 bit assembler
        language: playground.settings.language,
        peripherals: { clock: new ProgramClock({ mode: 'virtual' }) }
    })
}

function buildErrorOf(e: unknown): string {
    const error = e as { report?: { getErrors?: () => unknown }; message?: string }
    try {
        const reported = error.report?.getErrors?.()
        if (Array.isArray(reported) && reported.length > 0) {
            return reported.map((entry) => String(entry)).join('\n')
        }
    } catch {
        //a report that cannot be read is still a build failure, and the message below says so
    }
    return error.message ?? String(e)
}

async function build(emulator: Emulator, playground: ContentPlayground): Promise<void> {
    let failure: string | undefined
    try {
        //no undo history: nothing here steps backwards, and the buffer is the slowest part of a build
        await emulator.compile(0, playground.code)
    } catch (e) {
        failure = buildErrorOf(e)
    }
    if (failure !== undefined) {
        throw new Error(`${nameOf(playground)} does not build:\n${failure}`)
    }
}

type RunOutcome = {
    /** Whether the Emulator says the program has no next instruction. */
    terminated: boolean
    /** Everything a second run could land differently on, as one comparable string. */
    fingerprint: string
}

/**
 * Builds and runs a playground the way the embed's Run button does, with the scripted input of its
 * `testcase` fence standing in for the reader's typing. Input is always scripted, even when the
 * fence declares none: a program that then asks for a line stops with "Input does not have any
 * values left", which is the failure the plan asks for instead of a test that hangs on a prompt
 * nobody can answer.
 */
async function runOnce(
    playground: ContentPlayground,
    limit: number,
    allowLimit = false
): Promise<RunOutcome> {
    const emulator = await emulatorFor(playground)
    try {
        await build(emulator, playground)
        emulator.peripherals.terminal.useScriptedInput(playground.testcase?.input ?? [])
        const status = await emulator.run(limit)
        //the M68K Core reports the end of its instruction budget as a runtime error, which is
        //exactly what a program that runs until Stop is expected to hit once `runFor` allows it
        const errors = emulator.errors.filter(
            (error) => !(allowLimit && EXECUTION_LIMIT.test(error))
        )
        if (errors.length > 0) {
            throw new Error(`${nameOf(playground)} stopped with an error:\n${errors.join('\n')}`)
        }
        if (!allowLimit && status === InterpreterStatus.TerminatedWithException) {
            throw new Error(`${nameOf(playground)} stopped with an error`)
        }
        return {
            terminated: emulator.terminated,
            fingerprint: [
                emulator.pc,
                emulator.sp,
                emulator.stdOut,
                emulator.registers.map((register) => register.value).join(','),
                emulator.statusRegisters.map((register) => register.value).join(',')
            ].join('|')
        }
    } finally {
        emulator.dispose()
    }
}

/**
 * A playground must finish inside the embed's instruction limit, unless its `testcase` fence says
 * how long to run it for.
 *
 * "Finished" is not one question across the languages: an Emulator calls itself terminated when the
 * program has no next instruction, which is how an M68K and a Z80 program end, while a MIPS or
 * RISC-V program exits through a syscall and leaves its own subroutines sitting after it in the text
 * segment. So a run that does not report itself terminated is done again with twice the budget: a
 * program that had already finished lands in exactly the same state, and one that was still going
 * does not.
 */
async function runToTheEnd(playground: ContentPlayground): Promise<void> {
    const limit = playground.runFor ?? INSTRUCTION_LIMIT
    const first = await runOnce(playground, limit, playground.runFor !== undefined)
    if (playground.runFor !== undefined || first.terminated) return
    const longer = await runOnce(playground, limit * 2)
    if (longer.fingerprint !== first.fingerprint) {
        throw new Error(
            `${nameOf(playground)} was still running after ${limit} instructions. ` +
                'A program that never ends declares how long to run it for with a "runFor" key ' +
                'in a `testcase` fence.'
        )
    }
}

function describeErrors(errors: TestcaseValidationError[]): string {
    return errors
        .map((error) => {
            switch (error.type) {
                case 'wrong-register':
                    return `${error.register} is ${error.got}, expected ${error.expected}`
                case 'wrong-output':
                    return `the output is ${JSON.stringify(error.got)}, expected ${JSON.stringify(error.expected)}`
                case 'wrong-memory-string':
                    return `the string at ${error.address} is ${JSON.stringify(error.got)}, expected ${JSON.stringify(error.expected)}`
                default:
                    return `memory at ${error.address} is ${error.got}, expected ${error.expected}`
            }
        })
        .join('; ')
}

/**
 * Runs one playground against one testcase through the very path the Test button uses, so what the
 * page promises the reader and what the editor tells them agree. A build failure or a runtime error
 * leaves the emulator with no result for the testcase, which counts as not passing.
 */
async function runTestcase(
    emulator: Emulator,
    playground: ContentPlayground,
    testcase: Testcase
): Promise<{ passed: boolean; reason: string }> {
    const results = await emulator.test(
        playground.code,
        [testcase],
        playground.runFor ?? INSTRUCTION_LIMIT,
        0
    )
    const result = results[0]
    if (!result) return { passed: false, reason: emulator.errors.join('\n') || 'it did not run' }
    return { passed: result.passed, reason: describeErrors(result.errors) }
}

const pages = contentPages()

it('finds the course pages', () => {
    expect(pages.length).toBeGreaterThan(0)
})

for (const page of pages) {
    const skipped = page.playgrounds.filter(
        (playground) => UNRUNNABLE[playground.settings.language] !== undefined
    )
    const runnable = page.playgrounds.filter(
        (playground) => UNRUNNABLE[playground.settings.language] === undefined
    )
    if (page.error === undefined && page.playgrounds.length === 0) continue

    describe(page.path, () => {
        if (page.error !== undefined) {
            it('has readable fences', () => {
                expect.unreachable(page.error)
            })
            return
        }

        for (const playground of skipped) {
            it.skip(`${nameOf(playground)}: ${UNRUNNABLE[playground.settings.language]}`, () => {})
        }

        for (const playground of runnable) {
            //an exercise skeleton is meant to be incomplete, so it is held to its testcase below
            //rather than to a clean run; what it must do here is build, since the reader starts
            //from it
            if (playground.isExercise) {
                it(
                    `${nameOf(playground)} builds`,
                    async () => {
                        const emulator = await emulatorFor(playground)
                        try {
                            await build(emulator, playground)
                            expect(emulator.compilerErrors).toEqual([])
                        } finally {
                            emulator.dispose()
                        }
                    },
                    TIMEOUT
                )
                continue
            }
            it(`${nameOf(playground)} runs`, async () => await runToTheEnd(playground), TIMEOUT)
        }

        for (const playground of runnable.filter((candidate) => candidate.isExercise)) {
            it(
                `${nameOf(playground)} is an exercise the solution passes and the skeleton fails`,
                async () => {
                    const testcase = playground.testcase
                    expect(
                        testcase,
                        `${nameOf(playground)} is an exercise without a \`testcase\` fence`
                    ).toBeDefined()
                    const solution = playground.solution
                    expect(
                        solution,
                        `${nameOf(playground)} is an exercise with no \`solution\` playground after it`
                    ).toBeDefined()
                    expect(
                        solution!.settings.language,
                        `${nameOf(playground)} and its solution are in different languages`
                    ).toBe(playground.settings.language)

                    const solutionEmulator = await emulatorFor(solution!)
                    let solutionResult: { passed: boolean; reason: string }
                    try {
                        solutionResult = await runTestcase(solutionEmulator, solution!, testcase!)
                    } finally {
                        solutionEmulator.dispose()
                    }
                    expect(
                        solutionResult.passed,
                        `the solution of ${nameOf(playground)} does not pass its testcase: ${solutionResult.reason}`
                    ).toBe(true)

                    const skeletonEmulator = await emulatorFor(playground)
                    let skeletonResult: { passed: boolean; reason: string }
                    try {
                        skeletonResult = await runTestcase(skeletonEmulator, playground, testcase!)
                    } finally {
                        skeletonEmulator.dispose()
                    }
                    expect(
                        skeletonResult.passed,
                        `the skeleton of ${nameOf(playground)} already passes its testcase, so it asks the reader for nothing`
                    ).toBe(false)
                },
                TIMEOUT
            )
        }
    })
}
