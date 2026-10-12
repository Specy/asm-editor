/**
 * An Executable in an x86 Project, through the Emulator: its Listing is what the debugger shows
 * and maps the program's addresses to, its Breakpoints are addresses, and a library's code is shown
 * in that library's Listing ([binary-import.md](../../../../../../docs/design/binary-import.md),
 * decisions 5 and 18, milestone M8 of the plan).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { instructionAddressAt, LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { X86Emulator } from './X86Emulator.svelte'

const fixture = (name: string) =>
    readFileSync(
        new URL(`../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
    ).toString('base64')

function executableSources(name = 'crackme'): BuildSources {
    return { entry: name, files: { [name]: { encoding: 'base64', content: fixture(name) } } }
}

/** The 0-based line of the Listing whose text, trimmed, is exactly this. */
function lineOf(listing: Listing, text: string): number {
    const lines = listing.text.split('\n')
    const line = lines.findIndex((candidate) => candidate.trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    expect(lines.indexOf(lines[line], line + 1), `${text} is not unique`).toBe(-1)
    return line
}

function cString(bytes: Uint8Array): string {
    const end = bytes.indexOf(0)
    return new TextDecoder().decode(bytes.subarray(0, end < 0 ? bytes.length : end))
}

const emulators: { dispose(): void }[] = []
afterEach(() => {
    emulators.splice(0).forEach((emulator) => emulator.dispose())
})

async function built(sources: BuildSources) {
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    emulators.push(emulator)
    await emulator.compile(100_000, sources)
    expect(emulator.errors).toEqual([])
    expect(emulator.canExecute).toBe(true)
    const document = emulator.listings!.session.get(sources.entry)!
    expect(document.status).toBe('ready')
    return { emulator, listing: document.listing! }
}

describe('a Debug session of an Executable', () => {
    it("shows where a dynamic program starts in the dynamic linker's Listing", async () => {
        const { emulator } = await built(executableSources())
        // A dynamic program starts in its dynamic linker, whose Listing is generated the first
        // time the run is in it; the line is read again once it is ready.
        expect(emulator.currentFile).toBe('@lib/ld-linux-x86-64.so.2')
        const linker = emulator.listings!.session.get('@lib/ld-linux-x86-64.so.2')!
        await linker.ready
        await Promise.resolve()
        expect(emulator.currentFile).toBe('@lib/ld-linux-x86-64.so.2')
        expect(emulator.line).toBeGreaterThanOrEqual(0)
        const listing = linker.listing!
        expect(listing.lines.kinds[emulator.line]).toBe(LINE_KIND.instruction)
        expect(listing.lines.addresses[emulator.line] + linker.base).toBe(Number(emulator.pc))
        expect(listing.text.split('\n')[0]).toBe('; ld-linux-x86-64.so.2')
    })

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
        // a static program has no dynamic linker: it starts in its own Listing, at `_start`
        expect(emulator.currentFile).toBe('crackme-static')
        expect(emulator.line).toBe(lineOf(listing, '_start:') + 1)
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
        expect([...emulator.listings!.session.keys()].sort()).toEqual([
            '@lib/ld-linux-x86-64.so.2',
            'crackme'
        ])
        emulator.clear()
        expect(emulator.listings!.session.size).toBe(0)
    })
})
