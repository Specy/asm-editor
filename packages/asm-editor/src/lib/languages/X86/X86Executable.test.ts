/**
 * An Executable in an x86 Project, through the Emulator: its Listing is what the debugger shows
 * and maps the program's addresses to, its Breakpoints are addresses, a library's code is shown
 * in that library's Listing, a Build runs to `main`, and a Step runs through library code
 * ([binary-import.md](../../../../../../docs/design/binary-import.md), decisions 5, 11 and 18,
 * milestones M8 and M9 of the plan).
 */
import { readFileSync } from 'node:fs'
import { analyze } from '@specy/x86/elf'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { TESTCASE_INSTRUCTION_LIMIT } from '#lib/Config.ts'
import { executableAnalysis } from '#lib/executables.ts'
import { needsDemangler } from '#lib/languages/demangle/loadDemangler.ts'
import { memoryHover, resolveMemoryAddress } from '#lib/languages/memoryRegions.ts'
import { instructionAddressAt, LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { InThreadWorker } from '#lib/pseudocode/inThreadWorker.ts'
import { PseudocodeClient } from '#lib/pseudocode/pseudocodeClient.ts'
import { PSEUDOCODE_HEADER_LINES } from '#lib/pseudocode/pseudocodeDocuments.svelte.ts'
import {
    pseudocodeBreakpointAddresses,
    pseudocodeLineOfAddress,
    pseudocodeMap
} from '#lib/pseudocode/pseudocodeMap.ts'
import { listingClient } from '#lib/listing/listingClient.ts'
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

/**
 * The first line from `from` that calls `name`, whatever comment the Listing writes after it (a C++
 * name's demangled one).
 */
function callLine(listing: Listing, name: string, from = 0): number {
    const lines = listing.text.split('\n')
    const line = lines.findIndex(
        (text, index) => index >= from && text.split(';')[0].trim() === `call ${name}`
    )
    expect(line, name).toBeGreaterThanOrEqual(0)
    return line
}

/** The line of a label, whatever comment the Listing writes after it. */
function labelLine(listing: Listing, name: string): number {
    const label = listing.labels.find((candidate) => candidate.name === name)
    expect(label, name).toBeDefined()
    return label!.line
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
    //the Build does not wait for the Listing, which fills the lines in when it is ready
    const document = emulator.listings!.session.get(sources.entry)!
    await document.ready
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

    it("stops on a Breakpoint set on the Pseudocode's `if (iVar1 == 0)`, before its test and jne", async () => {
        const sources = executableSources()
        const { emulator, listing } = await built(sources)
        //main's Pseudocode as a pane shows it, from the Listing the debugger runs with
        const main = listing.functions.find((fn) => fn.name === 'main')!
        const client = new PseudocodeClient(InThreadWorker)
        const result = await client.decompile(
            'crackme',
            sources.files.crackme,
            listing,
            main.address
        )
        client.dispose()
        if ('error' in result) throw new Error(result.error)
        const map = pseudocodeMap(listing, main, result.lines, PSEUDOCODE_HEADER_LINES)
        const branch =
            result.lines.findIndex((line) => line.text.trim() === 'if (iVar1 == 0) {') +
            PSEUDOCODE_HEADER_LINES
        expect(branch).toBeGreaterThan(PSEUDOCODE_HEADER_LINES)
        //a gutter click on the line: an address Breakpoint on the first instruction of its block
        const test = lineOf(listing, 'test eax, eax')
        const addresses = pseudocodeBreakpointAddresses(map, listing, branch)
        expect(addresses).toEqual([instructionAddressAt(listing, test)])
        for (const address of addresses) emulator.toggleAddressBreakpoint(address, 'crackme')

        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        await emulator.run(0)
        //stopped before the test, strcmp's answer in eax and the Pseudocode on the `if`
        expect(emulator.terminated).toBe(false)
        expect(emulator.currentFile).toBe('crackme')
        expect(emulator.line).toBe(test)
        expect(emulator.pc).toBe(BigInt(addresses[0] + PIE_LOAD_BASE))
        const pcLine = () =>
            pseudocodeLineOfAddress(map, listing, Number(emulator.pc) - listing.base)
        expect(pcLine()).toBe(branch)
        const rax = emulator.registers.find((register) => register.name === 'rax')!.value
        expect(BigInt(rax) & 0xffffffffn).not.toBe(0n)
        //a Step to the jne, the same line, then into the else branch
        await emulator.step()
        expect(emulator.line).toBe(test + 1)
        expect(listing.text.split('\n')[test + 1].trim()).toBe('jne .LAB_2')
        expect(pcLine()).toBe(branch)
        await emulator.step()
        const wrong =
            result.lines.findIndex((line) => line.text.includes('puts("Wrong!")')) +
            PSEUDOCODE_HEADER_LINES
        expect(pcLine()).not.toBe(branch)
        for (let i = 0; i < 10 && pcLine() !== wrong; i++) await emulator.step()
        expect(pcLine()).toBe(wrong)
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('Wrong!')
    })

    it('runs to the cursor, or an earlier Breakpoint, keeping no Breakpoint of its own', async () => {
        const { emulator, listing } = await built(executableSources())
        const call = lineOf(listing, 'call strcmp@plt')
        const test = lineOf(listing, 'test eax, eax')
        const at = (line: number) => ({
            file: 'crackme',
            address: instructionAddressAt(listing, line)!
        })
        emulator.toggleAddressBreakpoint(at(call).address, 'crackme')
        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        //Run to Cursor on the test after strcmp stops first on the person's Breakpoint before it
        await emulator.runTo([at(test)], 0)
        expect(emulator.terminated).toBe(false)
        expect(emulator.line).toBe(call)
        //and again, at the cursor's instruction
        await emulator.runTo([at(test)], 0)
        expect(emulator.line).toBe(test)
        expect(emulator.pc).toBe(BigInt(at(test).address + PIE_LOAD_BASE))
        expect(emulator.breakpoints).toEqual([at(call)])
        //from the cursor's own instruction it runs on, here to the program's end (ADR 0023)
        await emulator.runTo([at(test)], 0)
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

    it("takes the Listing's names in the memory view, where they are at run time", async () => {
        // stripped, so no symbol of the file names what the Listing does
        const { emulator, listing } = await built(executableSources('crackme-stripped'))
        const named = listing.labels.filter(
            (label) => label.origin === 'invented' || label.origin === 'string'
        )
        expect(named.map((label) => label.name)).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^FUN_/),
                expect.stringMatching(/^DAT_/),
                's_hunter2'
            ])
        )
        for (const label of named)
            expect(emulator.resolveMemoryLabel(label.name), label.name).toBe(
                BigInt(label.address + PIE_LOAD_BASE)
            )
        const password = emulator.resolveMemoryLabel('s_hunter2')!
        expect(cString(emulator.readMemoryBytes(password, 16))).toBe('hunter2')
        // a jump target's name is one only inside its function
        const block = listing.labels.find((label) => label.kind === 'block')!
        expect(emulator.resolveMemoryLabel(block.name)).toBeUndefined()
        expect(emulator.resolveMemoryLabel(block.fullName)).toBeUndefined()
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
    it('stops at main without waiting for the Listing, whose lines come when it is ready', async () => {
        //a Listing that takes as long as the test says, as a large static binary's does
        let finish!: () => void
        const held = new Promise<void>((resolve) => (finish = resolve))
        const generate = listingClient.generate.bind(listingClient)
        const spy = vi.spyOn(listingClient, 'generate').mockImplementation(async (order) => {
            await held
            return generate(order)
        })
        try {
            const sources = executableSources()
            const emulator = await emulatorFor(sources)
            await emulator.compile(100_000, sources)
            expect(emulator.canExecute).toBe(true)
            const document = emulator.listings!.session.get('crackme')!
            expect(document.status).toBe('generating')
            //at main, found from _start by the Listing's own rules
            expect(emulator.pc).toBe(BigInt(PIE_LOAD_BASE + 0x11e9))
            expect(emulator.currentFile).toBe('crackme')
            expect(emulator.line).toBe(-1)
            finish()
            await document.ready
            await new Promise((resolve) => setTimeout(resolve))
            expect(emulator.line).toBe(lineOf(document.listing!, 'main:') + 1)
        } finally {
            spy.mockRestore()
        }
    })

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

    it('reads the loaded objects once for code outside them, until the program runs again', async () => {
        const { emulator } = await built(executableSources())
        const core = (emulator as unknown as { core: { getLoadedObjects(): unknown[] } }).core
        const read = vi.spyOn(core, 'getLoadedObjects')
        //the stack, where a pwn challenge's shellcode runs: in no loaded object
        const stack = emulator.sp
        for (let i = 0; i < 5; i++) emulator.getSourceLocationFromAddress(stack)
        expect(read).toHaveBeenCalledTimes(1)
        //a Step may map memory, so the next question reads the list again, once
        await emulator.step()
        read.mockClear()
        for (let i = 0; i < 5; i++) emulator.getSourceLocationFromAddress(stack)
        expect(read).toHaveBeenCalledTimes(1)
        read.mockRestore()
    })

    it('opens the memory view on the stack page at main, as an assembled program does', async () => {
        const { emulator } = await built(executableSources())
        const global = emulator.memory.global
        const rsp = emulator.registers.find((register) => register.name === 'rsp')!.value
        expect(rsp).toBeGreaterThan(0x7fff00000000n)
        expect(global.address).toBe(rsp - (rsp % BigInt(global.pageSize)))
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

    it('shows a program that exited on no line, in the File it was in, making no Listing', async () => {
        for (const how of ['run', 'step', 'run into library code'] as const) {
            const { emulator, listing } = await built(executableSources())
            emulator.peripherals.terminal.useScriptedInput(['hunter2'])
            preferencesStore.values.stepIntoRuntimeLibrary.value = how === 'run into library code'
            if (how !== 'step') await emulator.run(0)
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
            // the Listing stays where the person was reading, rather than going to `_start`'s call
            // of __libc_start_main, the program's own code its end in libc is inside
            expect(emulator.currentFile, how).toBe('crackme')
            expect(emulator.line, how).toBe(-1)
            expect([...emulator.listings!.session.keys()], how).toEqual(['crackme'])
            if (how === 'step') {
                // an Undo takes the end back, and the program is on a line again
                emulator.undo()
                expect(emulator.terminated).toBe(false)
                expect(emulator.currentFile).toBe('crackme')
                expect(emulator.line).toBeGreaterThanOrEqual(0)
            }
        }
    })

    it('shows a C++ program that caught an exception on no line, not at its throw', async () => {
        const { emulator } = await built(executableSources('cpp'))
        await emulator.run(0)
        expect(emulator.stdOut).toBe('hello\nC++\ncaught exception\n')
        expect(emulator.termination).toMatchObject({ kind: 'exit', code: 0 })
        // the unwinding left __cxa_throw's frames and main returned: only exit's frames remain
        expect(emulator.callStack.map((frame) => frame.name)).not.toContain('main')
        expect(emulator.currentFile).toBe('cpp')
        expect(emulator.line).toBe(-1)
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

/**
 * A C++ Executable's names in the debug tools and the memory view
 * ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md), decisions 11 and 12), on the
 * Core's `cpp` fixture: `std::vector<std::string>` of two words written with `std::cout`.
 */
describe('C++ names of an Executable', () => {
    /** `std::operator<<(std::ostream&, std::string const&)`, through the PLT. */
    const WRITE_STRING =
        '_ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE'
    /** `std::operator<<(std::ostream&, char)`, through the PLT. */
    const WRITE_CHARACTER = '_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c'
    /** `std::string`'s constructor from a `char const*`, `main`'s first call. */
    const STRING_FROM_LITERAL =
        '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEC1IS3_EEPKcRKS3_'

    it('names the memory view’s data labels demangled, the raw names in the hover and the address box', async () => {
        const { emulator, listing } = await built(executableSources('cpp'))
        const label = (name: string) => emulator.dataLabels.find((label) => label.name === name)!
        const cout = label('_ZSt4cout@GLIBCXX_3.4')
        expect(cout.displayName).toBe('std::cout@GLIBCXX_3.4')
        expect(label('_ZTISt13runtime_error@GLIBCXX_3.4').displayName).toBe(
            'typeinfo for std::runtime_error@GLIBCXX_3.4'
        )
        // names that are not mangled read as before
        expect(label('__dso_handle').displayName).toBeUndefined()
        expect(label('DW.ref.__gxx_personality_v0').displayName).toBeUndefined()
        // the grid's hover gives both
        expect(memoryHover(emulator.memoryRegions, emulator.dataLabels, cout.address + 8n)).toBe(
            '.bss · std::cout@GLIBCXX_3.4+8 (_ZSt4cout@GLIBCXX_3.4)'
        )
        // the address box takes the demangled name, and the raw names it took before
        const resolve = (input: string) =>
            resolveMemoryAddress(input, true, (name) => emulator.resolveMemoryLabel(name))
        expect(resolve('std::cout@GLIBCXX_3.4')).toBe(cout.address)
        expect(resolve('std::cout@GLIBCXX_3.4+8')).toBe(cout.address + 8n)
        expect(resolve('_ZSt4cout@GLIBCXX_3.4')).toBe(cout.address)
        expect(resolve('typeinfo for std::runtime_error@GLIBCXX_3.4')).toBe(
            label('_ZTISt13runtime_error@GLIBCXX_3.4').address
        )
        expect(resolve('main')).toBe(BigInt(listing.main! + PIE_LOAD_BASE))
    })

    it('names the Call stack’s frames demangled, the signature and raw name in their tooltip', async () => {
        const { emulator, listing } = await built(executableSources('cpp'))
        await stepTo(emulator, callLine(listing, STRING_FROM_LITERAL))
        await emulator.step()
        const frames = emulator.callStack
        expect(frames.at(-1)).toMatchObject({
            name: 'std::string::basic_string<std::allocator<char>>',
            detail: `std::string::basic_string<std::allocator<char>>(char const*, std::allocator<char> const&)\n${STRING_FROM_LITERAL}`,
            file: 'cpp',
            line: labelLine(listing, STRING_FROM_LITERAL)
        })
        // C names, libc's frames among them, read as before, with no tooltip
        const main = frames.find((frame) => frame.name === 'main')!
        expect(main.detail).toBeUndefined()
        const libc = frames.filter((frame) => frame.file === '@lib/libc.so.6')
        expect(libc.map((frame) => frame.name)).toContain('__libc_start_main')
        expect(libc.every((frame) => frame.detail === undefined)).toBe(true)
    })

    it('names a frame by what the Symbols panel lists, the signature where the Listing has overloads', async () => {
        const { emulator, listing } = await built(executableSources('cpp'))
        //`std::string::_M_local_data()`, beside `std::string::_M_local_data() const`
        const LOCAL_DATA = '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE13_M_local_dataEv'
        const start = firstInstructionAfter(listing, labelLine(listing, LOCAL_DATA))
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, start)!, 'cpp')
        await emulator.run(0)
        expect(emulator.line).toBe(start)
        const frames = emulator.callStack
        expect(frames.at(-1)).toMatchObject({
            name: 'std::string::_M_local_data()',
            detail: `std::string::_M_local_data()\n${LOCAL_DATA}`,
            line: labelLine(listing, LOCAL_DATA)
        })
        //its caller has no overload: its short name
        expect(frames.at(-2)).toMatchObject({
            name: 'std::string::basic_string<std::allocator<char>>',
            detail: `std::string::basic_string<std::allocator<char>>(char const*, std::allocator<char> const&)\n${STRING_FROM_LITERAL}`
        })
    })

    it('takes a function’s short name or signature in the address box, when only one address has it', async () => {
        const { emulator, listing } = await built(executableSources('cpp'))
        const resolve = (input: string) =>
            resolveMemoryAddress(input, true, (name) => emulator.resolveMemoryLabel(name))
        const at = (name: string) =>
            BigInt(listing.labels.find((label) => label.name === name)!.address + PIE_LOAD_BASE)
        const destructor = at('_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev')
        expect(resolve('std::string::~basic_string')).toBe(destructor)
        expect(resolve('std::string::~basic_string()+4')).toBe(destructor + 4n)
        expect(resolve('operator new')).toBe(at('_ZnwmPv'))
        expect(resolve('operator new@plt')).toBe(at('_Znwm@plt'))
        //overloads: only their signatures name one
        const localData = at(
            '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE13_M_local_dataEv'
        )
        expect(resolve('std::string::_M_local_data()')).toBe(localData)
        expect(resolve('std::string::_M_local_data() const')).toBe(
            at('_ZNKSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE13_M_local_dataEv')
        )
        expect(() => resolve('std::string::_M_local_data')).toThrow(
            'Unknown label: std::string::_M_local_data'
        )
        //raw names as before
        expect(resolve('_ZnwmPv')).toBe(at('_ZnwmPv'))
    })

    it('names a frame in libstdc++ demangled, and the PLT stub that led there', async () => {
        const { emulator, listing } = await built(executableSources('cpp'))
        // the second word's write, whose calls the first one bound
        const write = callLine(listing, `${WRITE_STRING}@plt`)
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, write)!, 'cpp')
        await emulator.run(0)
        await emulator.run(0)
        expect(emulator.line).toBe(write)
        expect(emulator.stdOut).toBe('hello\n')
        preferencesStore.values.stepIntoRuntimeLibrary.value = true
        const inLibrary = () =>
            emulator.callStack.find((frame) => frame.file === '@lib/libstdc++.so.6')
        for (let i = 0; i < 100 && !inLibrary(); i++) await emulator.step()
        // named by the library's Listing once it is made
        await emulator.listings!.session.get('@lib/libstdc++.so.6')!.ready
        await Promise.resolve()
        expect(inLibrary()).toMatchObject({
            name: 'std::ostream::sentry::sentry@plt',
            detail: 'std::ostream::sentry::sentry(std::ostream&)@plt\n_ZNSo6sentryC1ERSo@plt'
        })
        const stub = labelLine(listing, `${WRITE_STRING}@plt`)
        expect(emulator.callStack.find((frame) => frame.line === stub)).toMatchObject({
            name: 'std::operator<<<char, std::char_traits<char>, std::allocator<char>>@plt',
            detail: `std::operator<<<char, std::char_traits<char>, std::allocator<char>>(std::ostream&, std::string const&)@plt\n${WRITE_STRING}@plt`
        })
        // libstdc++'s Listing takes seconds
    }, 30_000)

    it('names the History’s calls into libstdc++ demangled, the signature and raw name in their tooltip', async () => {
        const { emulator, listing } = await built(executableSources('cpp'))
        const write = callLine(listing, `${WRITE_STRING}@plt`)
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, write)!, 'cpp')
        await emulator.run(0)
        await emulator.step()
        expect(emulator.latestSteps[0].stretch).toEqual({
            library:
                'std::operator<<<char, std::char_traits<char>, std::allocator<char>> in libstdc++.so.6',
            detail: `std::operator<<<char, std::char_traits<char>, std::allocator<char>>(std::ostream&, std::string const&)\n${WRITE_STRING}`,
            instructions: expect.any(Number)
        })
        await stepTo(emulator, callLine(listing, `${WRITE_CHARACTER}@plt`, write))
        await emulator.step()
        expect(emulator.stdOut).toBe('hello\n')
        expect(emulator.latestSteps[0].stretch).toMatchObject({
            library: 'std::operator<<<std::char_traits<char>> in libstdc++.so.6',
            detail: `std::operator<<<std::char_traits<char>>(std::ostream&, char)\n${WRITE_CHARACTER}`
        })
    })

    it('leaves a C program’s names as they were', async () => {
        const sources = executableSources()
        expect(needsDemangler(executableAnalysis(sources.files.crackme))).toBe(false)
        const { emulator, listing } = await built(sources)
        expect(emulator.dataLabels.every((label) => label.displayName === undefined)).toBe(true)
        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        await stepTo(emulator, lineOf(listing, 'call printf@plt'))
        await emulator.step()
        expect(emulator.latestSteps[0].stretch).toEqual({
            library: 'printf in libc.so.6',
            instructions: expect.any(Number)
        })
        expect(emulator.callStack.every((frame) => frame.detail === undefined)).toBe(true)
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

    it('take no Pause in their run to main, as no Testcase run does', async () => {
        const sources = executableSources()
        const emulator = await emulatorFor(sources)
        let finished = false
        const results = emulator
            .test(
                sources,
                [testcase({ input: ['hunter2'], expectedOutput: 'Enter password: Correct!\n' })],
                TESTCASE_INSTRUCTION_LIMIT
            )
            .finally(() => (finished = true))
        //the Pause button stays a Pause button while the Testcases run
        let pauses = 0
        while (!finished) {
            emulator.pause()
            pauses++
            await new Promise((resolve) => setTimeout(resolve, 0))
        }
        expect(pauses).toBeGreaterThan(1)
        const [result] = await results
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
        expect(emulator.paused).toBe(false)
    })
})
