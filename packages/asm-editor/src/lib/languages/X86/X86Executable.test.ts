/**
 * An Executable in an x86 Project, through the Emulator: its Listing is what the debugger shows
 * and maps the program's addresses to, its Breakpoints are addresses, a library's code is shown
 * in that library's Listing, a Build runs to `main`, and a Step runs through library code
 * ([binary-import.md](../../../../../../docs/design/binary-import.md), decisions 5, 11 and 18,
 * milestones M8 and M9 of the plan).
 */
import { readFileSync } from 'node:fs'
import { analyze } from '@specy/x86/elf'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { TESTCASE_INSTRUCTION_LIMIT } from '#lib/Config.ts'
import { instructionAddressAt, LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { X86Emulator } from './X86Emulator.svelte'

const fixtureBytes = (name: string) =>
    readFileSync(new URL(`../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url))

function executableSources(name = 'crackme', bytes: Uint8Array = fixtureBytes(name)): BuildSources {
    const content = Buffer.from(bytes).toString('base64')
    return { entry: name, files: { [name]: { encoding: 'base64', content } } }
}

/** The 0-based line of the Listing whose text, trimmed, is exactly this. */
function lineOf(listing: Listing, text: string): number {
    const lines = listing.text.split('\n')
    const line = lines.findIndex((candidate) => candidate.trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    expect(lines.indexOf(lines[line], line + 1), `${text} is not unique`).toBe(-1)
    return line
}

/** The first instruction line after a label line. */
function firstInstructionAfter(listing: Listing, label: number): number {
    let line = label + 1
    while (listing.lines.kinds[line] !== LINE_KIND.instruction) line++
    return line
}

function cString(bytes: Uint8Array): string {
    const end = bytes.indexOf(0)
    return new TextDecoder().decode(bytes.subarray(0, end < 0 ? bytes.length : end))
}

const testcase = (part: Partial<Testcase>): Testcase => ({
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: [],
    ...part
})

const emulators: { dispose(): void }[] = []
afterEach(() => {
    emulators.splice(0).forEach((emulator) => emulator.dispose())
    preferencesStore.values.stepIntoRuntimeLibrary.value = false
})

async function emulatorFor(sources: BuildSources) {
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    emulators.push(emulator)
    return emulator
}

async function built(sources: BuildSources) {
    const emulator = await emulatorFor(sources)
    await emulator.compile(100_000, sources)
    expect(emulator.errors).toEqual([])
    expect(emulator.canExecute).toBe(true)
    const document = emulator.listings!.session.get(sources.entry)!
    expect(document.status).toBe('ready')
    return { emulator, listing: document.listing! }
}

type Emulator = Awaited<ReturnType<typeof emulatorFor>>

/** Steps until the current line is `line`, as a person pressing Step would. */
async function stepTo(emulator: Emulator, line: number) {
    for (let i = 0; i < 100 && emulator.line !== line; i++) await emulator.step()
    expect(emulator.line).toBe(line)
}

/**
 * Steps from a `call name@plt` into the library through the stub, which with CET starts with
 * `endbr64` and then jumps: three Steps in all.
 */
async function stepToLibrary(emulator: Emulator) {
    for (let i = 0; i < 3; i++) await emulator.step()
    expect(emulator.currentFile).toBe('@lib/libc.so.6')
}

const pauseUntil = async (predicate: () => boolean) => {
    for (let i = 0; i < 2000; i++) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 2))
    }
    throw new Error('condition did not become true')
}

describe('a Debug session of an Executable', () => {
    it('stops on a Breakpoint on `call strcmp@plt`, with the password in rsi', async () => {
        const { emulator, listing } = await built(executableSources())
        const line = lineOf(listing, 'call strcmp@plt')
        const address = instructionAddressAt(listing, line)!
        emulator.toggleAddressBreakpoint(address, 'crackme')
        // a line holding no instruction takes none, and the address is link-time
        expect(emulator.breakpoints).toEqual([{ file: 'crackme', address }])
        expect(address).toBeLessThan(0x10000)

        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        await emulator.run(0)
        expect(emulator.terminated).toBe(false)
        expect(emulator.pc).toBe(BigInt(address + PIE_LOAD_BASE))
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(line)

        const register = (name: string) =>
            emulator.registers.find((candidate) => candidate.name === name)!.value
        expect(cString(emulator.readMemoryBytes(register('rsi'), 16))).toBe('hunter2')
        expect(cString(emulator.readMemoryBytes(register('rdi'), 16))).toBe('swordfish')

        // The History and the Call stack name the Executable's Listing lines too.
        const [newest] = emulator.latestSteps
        expect(newest).toMatchObject({ file: 'crackme', line: line - 1 })
        const main = emulator.callStack.find((frame) => frame.name === 'main')
        expect(main).toMatchObject({ file: 'crackme', line: lineOf(listing, 'main:') })

        // Run on from the Breakpoint: the program ends, having printed its verdict.
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('Wrong!')
    })

    it('keeps the History and Call stack on their lines when an instruction is unreadable', async () => {
        const { emulator, listing } = await built(executableSources())
        const line = lineOf(listing, 'call strcmp@plt')
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, line)!, 'crackme')
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        await emulator.run(0)
        expect(emulator.line).toBe(line)

        // The Core answers null for an instruction whose bytes run into unmapped memory.
        const core = (emulator as unknown as { core: Record<string, unknown> }).core
        core.getInstructionAt = () => null
        core.getNextInstruction = () => null
        expect(emulator.getSourceLocationFromAddress(emulator.pc)).toBeNull()
        expect(emulator.undo(0)).toBe(0)
        expect(emulator.line).toBe(-1)
        expect(emulator.latestSteps[0]).toMatchObject({ file: 'crackme', line: line - 1 })
        expect(emulator.callStack.find((frame) => frame.name === 'main')).toMatchObject({
            file: 'crackme',
            line: lineOf(listing, 'main:')
        })
    })

    it('stops on a Breakpoint in a program at fixed addresses, which has no load bias', async () => {
        const { emulator, listing } = await built(executableSources('crackme-static'))
        const line = listing.text.split('\n').findIndex((text) => /^ {4}call strcmp\b/.test(text))
        expect(line).toBeGreaterThan(0)
        const address = instructionAddressAt(listing, line)!
        emulator.toggleAddressBreakpoint(address, 'crackme-static')
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        await emulator.run(0)
        expect(emulator.pc).toBe(BigInt(address))
        expect(emulator.currentFile).toBe('crackme-static')
        expect(emulator.line).toBe(line)
    })

    it('drops the running Listings when the session ends', async () => {
        const { emulator } = await built(executableSources())
        // the Build ran to `main` without making a library's Listing: nothing showed one
        expect([...emulator.listings!.session.keys()]).toEqual(['crackme'])
        preferencesStore.values.stepIntoRuntimeLibrary.value = true
        const listing = emulator.listings!.session.get('crackme')!.listing!
        await stepTo(emulator, lineOf(listing, 'call printf@plt'))
        await stepToLibrary(emulator)
        expect([...emulator.listings!.session.keys()].sort()).toEqual(['@lib/libc.so.6', 'crackme'])
        emulator.clear()
        expect(emulator.listings!.session.size).toBe(0)
    })
})

describe('the start of an Executable', () => {
    it("stops a Build at main's first instruction, before which nothing can be undone", async () => {
        const { emulator, listing } = await built(executableSources())
        expect(listing.main).toBeDefined()
        expect(emulator.pc).toBe(BigInt(listing.main! + PIE_LOAD_BASE))
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(firstInstructionAfter(listing, lineOf(listing, 'main:')))
        // the dynamic linker and libc's start-up ran outside the history, and wrote nothing
        expect(emulator.canUndo).toBe(false)
        expect(emulator.undo(5)).toBe(0)
        expect(emulator.latestSteps).toEqual([])
        expect(emulator.stdOut).toBe('')
        // Undo reaches back to main and no further
        await emulator.step()
        await emulator.step()
        expect(emulator.undo(5)).toBe(2)
        expect(emulator.pc).toBe(BigInt(listing.main! + PIE_LOAD_BASE))
        expect(emulator.canUndo).toBe(false)
    })

    it('stops a Build earlier at a Breakpoint on `_start`', async () => {
        const sources = executableSources()
        const emulator = await emulatorFor(sources)
        await emulator.compile(100_000, sources)
        const listing = emulator.listings!.session.get('crackme')!.listing!
        const start = firstInstructionAfter(listing, lineOf(listing, '_start:'))
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, start)!, 'crackme')
        await emulator.compile(100_000, sources)
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(start)
        expect(emulator.canUndo).toBe(false)
        // and Run goes on to the end from there
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toBe('Enter password: Correct!\n')
    })

    it('finds main in a stripped program from the `_start` pattern', async () => {
        const { emulator, listing } = await built(executableSources('crackme-stripped'))
        expect(listing.labels.find((label) => label.name === 'main')?.origin).toBe('main')
        expect(emulator.pc).toBe(BigInt(listing.main! + PIE_LOAD_BASE))
        expect(emulator.currentFile).toBe('crackme-stripped')
        expect(emulator.line).toBe(firstInstructionAfter(listing, lineOf(listing, 'main:')))
    })

    it('stops at the entry point of a program whose main it cannot find', async () => {
        // `lea rdi, [rel main]` in `_start` made a load, `mov rdi, [rel main]`, which the
        // pattern does not take for main's address
        const bytes = new Uint8Array(fixtureBytes('crackme-stripped'))
        const info = analyze(bytes)
        const text = info.programHeaders.find(
            (header) =>
                header.type === 1 &&
                info.entry >= header.address &&
                info.entry < header.address + BigInt(header.fileSize)
        )!
        const entry = Number(info.entry - text.address) + text.offset
        const lea = bytes
            .subarray(entry, entry + 64)
            .findIndex(
                (byte, i, all) => byte === 0x48 && all[i + 1] === 0x8d && all[i + 2] === 0x3d
            )
        expect(lea).toBeGreaterThan(0)
        bytes[entry + lea + 1] = 0x8b
        const { emulator, listing } = await built(executableSources('no-main', bytes))
        expect(listing.main).toBeUndefined()
        expect(emulator.pc).toBe(BigInt(listing.entry + PIE_LOAD_BASE))
        expect(emulator.currentFile).toBe('no-main')
        expect(emulator.line).toBe(firstInstructionAfter(listing, lineOf(listing, '_start:')))
        expect(emulator.canUndo).toBe(false)
    })

    it('stops a static program at main, with no library loaded', async () => {
        const { emulator, listing } = await built(executableSources('hello-atexit-static'))
        expect(emulator.pc).toBe(BigInt(listing.main!))
        expect(emulator.line).toBe(firstInstructionAfter(listing, lineOf(listing, 'main:')))
        // libc is part of the Executable, so a Step into one of its functions enters it
        const call = lineOf(listing, 'call atexit')
        await stepTo(emulator, call)
        await emulator.step()
        expect(emulator.currentFile).toBe('hello-atexit-static')
        expect(emulator.line).toBe(firstInstructionAfter(listing, lineOf(listing, 'atexit:')))
        expect([...emulator.listings!.session.keys()]).toEqual(['hello-atexit-static'])
    })
})

describe('library code of an Executable', () => {
    it('steps over `call printf@plt`, `call strcmp@plt` and `call puts@plt`, each one History row', async () => {
        const { emulator, listing } = await built(executableSources())
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        const printf = lineOf(listing, 'call printf@plt')
        await stepTo(emulator, printf)
        await emulator.step()
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(printf + 1)
        // one row in the History, which names what the call ran
        const [row] = emulator.latestSteps
        expect(row).toMatchObject({ file: 'crackme', line: printf })
        expect(row.stretch?.library).toBe('printf in libc.so.6')
        expect(row.stretch?.instructions).toBeGreaterThan(10)
        // no library Listing was made for it
        expect([...emulator.listings!.session.keys()]).toEqual(['crackme'])

        // one Undo takes a whole call back (printf's first call maps its buffer, which no Undo
        // takes back, so the call to undo is strcmp's)
        const strcmp = lineOf(listing, 'call strcmp@plt')
        await stepTo(emulator, strcmp)
        await emulator.step()
        expect(emulator.line).toBe(strcmp + 1)
        expect(emulator.latestSteps[0].stretch?.library).toBe('strcmp in libc.so.6')
        expect(emulator.latestSteps[0].undoable).not.toBe(false)
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.line).toBe(strcmp)
        expect(emulator.latestSteps[0].line).toBe(strcmp - 1)
        await emulator.step()
        expect(emulator.line).toBe(strcmp + 1)

        // the first of two, after `Correct!`
        const puts = listing.text.split('\n').findIndex((text) => text.trim() === 'call puts@plt')
        await stepTo(emulator, puts)
        expect(emulator.stdOut).toBe('Enter password: ')
        await emulator.step()
        expect(emulator.line).toBe(puts + 1)
        expect(emulator.stdOut).toBe('Enter password: Correct!\n')
        expect(emulator.latestSteps[0].stretch?.library).toBe('puts in libc.so.6')
        expect([...emulator.listings!.session.keys()]).toEqual(['crackme'])
    })

    it('enters libc with Step into library code on', async () => {
        const { emulator, listing } = await built(executableSources())
        preferencesStore.values.stepIntoRuntimeLibrary.value = true
        const printf = lineOf(listing, 'call printf@plt')
        await stepTo(emulator, printf)
        // the call goes to its PLT stub, in the Executable, which jumps into libc
        await emulator.step()
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(firstInstructionAfter(listing, lineOf(listing, 'printf@plt:')))
        await emulator.step()
        expect(emulator.currentFile).toBe('crackme')
        await emulator.step()
        expect(emulator.currentFile).toBe('@lib/libc.so.6')
        const libc = emulator.listings!.session.get('@lib/libc.so.6')!
        await libc.ready
        await Promise.resolve()
        expect(emulator.currentFile).toBe('@lib/libc.so.6')
        expect(emulator.line).toBeGreaterThanOrEqual(0)
        expect(libc.listing!.lines.addresses[emulator.line] + libc.base).toBe(Number(emulator.pc))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()
    })

    it("writes the prompt before the read that waits, shown at main's call into libc", async () => {
        const { emulator, listing } = await built(executableSources())
        const terminal = emulator.peripherals.terminal
        const run = emulator.run(0)
        await pauseUntil(() => emulator.interrupt !== undefined)
        // glibc line-buffers a tty's standard output and flushes it before reading
        expect(emulator.stdOut).toBe('Enter password: ')
        // the read waits inside libc; what is shown is the program's call that reached it
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(lineOf(listing, 'call fgets@plt'))
        expect([...emulator.listings!.session.keys()]).toEqual(['crackme'])
        // the Call stack still leads into libc, whose Listing is made when it is gone to
        const fgets = emulator.callStack.find((frame) => frame.name === 'fgets@plt')
        expect(fgets).toMatchObject({ file: 'crackme' })
        expect(emulator.callStack.some((frame) => frame.file === '@lib/libc.so.6')).toBe(true)
        terminal.insertText('hunter2')
        terminal.pressEnter()
        await run
        expect(emulator.terminated).toBe(true)
        expect(terminal.output).toBe('Enter password: hunter2\nCorrect!\n')
    })

    it('shows the library line of a read that waits with Step into library code on', async () => {
        const { emulator } = await built(executableSources())
        preferencesStore.values.stepIntoRuntimeLibrary.value = true
        const run = emulator.run(0)
        await pauseUntil(() => emulator.interrupt !== undefined)
        expect(emulator.currentFile).toBe('@lib/libc.so.6')
        emulator.peripherals.terminal.insertText('hunter2')
        emulator.peripherals.terminal.pressEnter()
        await run
    })

    it('stops on a Breakpoint in a PLT stub, shown there, and steps on into libc and out', async () => {
        const { emulator, listing } = await built(executableSources())
        const stub = firstInstructionAfter(listing, lineOf(listing, 'strcmp@plt:'))
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, stub)!, 'crackme')
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        await emulator.run(0)
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(stub)
        // a Step from the stub runs through it and strcmp, back to after the call in main
        await emulator.step()
        expect(emulator.line).toBe(lineOf(listing, 'call strcmp@plt') + 1)
        expect([...emulator.listings!.session.keys()]).toEqual(['crackme'])
    })

    it('shows a program that ended inside libc at its call into libc, making no Listing', async () => {
        for (const how of ['run', 'step'] as const) {
            const { emulator, listing } = await built(executableSources())
            emulator.peripherals.terminal.useScriptedInput(['hunter2'])
            if (how === 'run') await emulator.run(0)
            else {
                // main returns into libc, which exits; on the way it calls back into the program's
                // destructors, where a Step stops, as in any callback
                const lines = listing.text.split('\n')
                const ret = lines.findIndex(
                    (text, line) => line > lineOf(listing, 'main:') && text.trim() === 'ret'
                )
                await stepTo(emulator, ret)
                const callbacks = new Set<string>()
                for (let i = 0; i < 50 && !emulator.terminated; i++) {
                    await emulator.step()
                    if (!emulator.terminated) callbacks.add(emulator.currentFile)
                }
                expect([...callbacks]).toEqual(['crackme'])
            }
            expect(emulator.terminated).toBe(true)
            expect(emulator.termination).toMatchObject({ kind: 'exit', code: 0 })
            // the program's own code was inside `_start`'s call to __libc_start_main
            expect(emulator.currentFile).toBe('crackme')
            expect(emulator.line).toBe(lineOf(listing, 'call qword [rel __libc_start_main@got]'))
            expect([...emulator.listings!.session.keys()]).toEqual(['crackme'])
        }
    })

    it('shows a crash inside libc on its line, with the program a click away', async () => {
        const { emulator, listing } = await built(executableSources('overflow'))
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.termination).toMatchObject({ kind: 'signal', name: 'SIGSEGV' })
        expect(emulator.currentFile).toBe('@lib/libc.so.6')
        const libc = emulator.listings!.session.get('@lib/libc.so.6')!
        await libc.ready
        await Promise.resolve()
        expect(emulator.line).toBeGreaterThanOrEqual(0)
        expect(libc.listing!.lines.addresses[emulator.line] + libc.base).toBe(Number(emulator.pc))
        // the Call stack has main, and the call into libc whose return address is in main
        expect(emulator.callStack.find((frame) => frame.name === 'main')).toMatchObject({
            file: 'overflow',
            line: lineOf(listing, 'main:')
        })
        const strlen = emulator.callStack.find((frame) => frame.name === 'strlen@plt')!
        expect(strlen.file).toBe('overflow')
        const call = lineOf(listing, 'call strlen@plt')
        expect(emulator.getSourceLocationFromAddress(strlen.destination)).toEqual({
            file: 'overflow',
            line: call + 1
        })
    })
})

describe('Testcases of an Executable', () => {
    it('run from main, so C++ start-up does not count against the instruction limit', async () => {
        const sources = executableSources('cpp')
        const emulator = await emulatorFor(sources)
        const [result] = await emulator.test(
            sources,
            [testcase({ expectedOutput: 'hello\nC++\ncaught exception\n' })],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
    })

    it('fail saying so when the program does not reach main', async () => {
        // `_start` made a loop, `jmp $`, in place of its `endbr64`
        const bytes = new Uint8Array(fixtureBytes('crackme'))
        const info = analyze(bytes)
        const text = info.programHeaders.find(
            (header) =>
                header.type === 1 &&
                info.entry >= header.address &&
                info.entry < header.address + BigInt(header.fileSize)
        )!
        const entry = Number(info.entry - text.address) + text.offset
        expect([...bytes.subarray(entry, entry + 4)]).toEqual([0xf3, 0x0f, 0x1e, 0xfa])
        bytes.set([0xeb, 0xfe, 0x90, 0x90], entry)
        const sources = executableSources('loop', bytes)
        const emulator = await emulatorFor(sources)
        ;(emulator as unknown as { programStartLimit: number }).programStartLimit = 200_000
        const [result] = await emulator.test(
            sources,
            [testcase({ expectedOutput: 'Enter password: ' })],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(result.passed).toBe(false)
        expect(result.errors).toContainEqual({
            type: 'runtime-error',
            message: 'The program did not reach main within 200,000 instructions'
        })
    })

    it('answer the prompt from the input and check the verdict', async () => {
        const sources = executableSources()
        const emulator = await emulatorFor(sources)
        const results = await emulator.test(
            sources,
            [
                testcase({ input: ['hunter2'], expectedOutput: 'Enter password: Correct!\n' }),
                testcase({ input: ['swordfish'], expectedOutput: 'Enter password: Wrong!\n' })
            ],
            TESTCASE_INSTRUCTION_LIMIT
        )
        expect(results.map((result) => result.passed)).toEqual([true, true])
    })
})
