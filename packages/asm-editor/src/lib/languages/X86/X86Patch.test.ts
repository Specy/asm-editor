/**
 * Patching an Executable's instruction from its Listing, through the Emulator: the text is
 * resolved, assembled at the line's address, padded or refused, written as one Poke, shown on its
 * Listing line as memory holds it, named in the History, and taken back by Undo
 * ([binary-import.md](../../../../../../docs/design/binary-import.md), decision 13, milestone M11
 * of the plan).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { instructionAddressAt, LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import type { PatchPreview } from '#lib/listing/listingPatcher.svelte.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { X86Emulator } from './X86Emulator.svelte'

const fixtureBytes = (name: string) =>
    readFileSync(new URL(`../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url))

function executableSources(name: string): BuildSources {
    const content = Buffer.from(fixtureBytes(name)).toString('base64')
    return { entry: name, files: { [name]: { encoding: 'base64', content } } }
}

const emulators: { dispose(): void }[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

async function built(name: string, programArguments?: string) {
    const sources = executableSources(name)
    const emulator = await X86Emulator(sources, { automaticChecking: false, programArguments })
    emulators.push(emulator)
    await emulator.compile(100_000, sources)
    expect(emulator.errors).toEqual([])
    const listing = emulator.listings!.session.get(name)!.listing!
    return { emulator, listing, patcher: emulator.patcher }
}

const lines = (listing: Listing) => listing.text.split('\n')

/** The 0-based line whose text, trimmed and without its comment, is exactly this, once. */
function lineOf(listing: Listing, text: string, after = 0): number {
    const all = lines(listing)
    const line = all.findIndex(
        (candidate, k) => k >= after && candidate.split(' ; ')[0].trim() === text
    )
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}

/** The `jne` that follows `call strcmp@plt`: the password check. */
function passwordCheck(listing: Listing): number {
    const call = lineOf(listing, 'call strcmp@plt')
    let line = call + 1
    while (!lines(listing)[line].trim().startsWith('jne ')) line++
    expect(line - call).toBeLessThan(4)
    return line
}

const hex = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')

function ok(preview: PatchPreview): Extract<PatchPreview, { ok: true }> {
    if (!preview.ok) throw new Error(preview.error)
    return preview
}

async function patch(
    patcher: Awaited<ReturnType<typeof built>>['patcher'],
    line: number,
    text: string
) {
    const site = patcher.site(line)!
    const preview = ok(await patcher.preview(site, text))
    expect(patcher.apply(preview)).toBe(true)
    return preview
}

describe('patching an instruction of an Executable', () => {
    it('flips the password check: a wrong password is Correct!', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        const site = patcher.site(line)!
        expect(site).toMatchObject({ path: 'crackme', line, length: 2, text: 'jne .LAB_2' })
        const address = BigInt(instructionAddressAt(listing, line)! + PIE_LOAD_BASE)
        expect(site.address).toBe(address)

        const preview = ok(await patcher.preview(site, 'je .LAB_2'))
        const original = emulator.readMemoryBytes(address, 2)
        expect(original[0]).toBe(0x75)
        //the same displacement, the opposite condition
        expect(hex(preview.bytes)).toBe(`74 ${hex(original.subarray(1))}`)
        expect(preview).toMatchObject({ encodedLength: 2, unchanged: false })
        expect(preview.line.instruction).toBe('je .LAB_2')
        expect(preview.line.comments).toEqual([])
        expect(hex(preview.was)).toBe(hex(original))

        expect(patcher.apply(preview)).toBe(true)
        //the memory view reads the new bytes, and the line shows them decoded
        expect(hex(emulator.readMemoryBytes(address, 2))).toBe(hex(preview.bytes))
        const patched = patcher.patched!.lines.get(line)!
        expect(patched.text).toBe('    je .LAB_2')
        expect(patched.originalText).toBe('jne .LAB_2')
        expect(lines(patcher.patched!.listing)[line]).toBe('    je .LAB_2')
        //nothing else of the Listing changed
        expect(patcher.patched!.listing.lines).toBe(listing.lines)
        expect(lines(patcher.patched!.listing).length).toBe(lines(listing).length)

        //one Poke, named as the patch it is
        const [step] = emulator.latestSteps
        expect(step.kind).toBe('poke')
        expect(step.title).toBe(`Patched jne → je at 0x${address.toString(16)}`)
        expect(emulator.canUndo).toBe(true)

        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('Correct!')
        expect(emulator.stdOut).not.toContain('Wrong!')
    })

    it('is taken back by Undo, which restores the line and the check', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        const address = patcher.site(line)!.address
        const original = hex(emulator.readMemoryBytes(address, 2))
        await patch(patcher, line, 'je .LAB_2')
        expect(patcher.patched?.lines.has(line)).toBe(true)

        expect(emulator.undo(1)).toBe(1)
        expect(hex(emulator.readMemoryBytes(address, 2))).toBe(original)
        expect(patcher.patched).toBeUndefined()
        expect(patcher.site(line)!.text).toBe('jne .LAB_2')

        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        await emulator.run(0)
        expect(emulator.stdOut).toContain('Wrong!')
    })

    it('is taken back after the Run it changed, from a stop after the input was read', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const call = lineOf(listing, 'call strcmp@plt')
        emulator.toggleAddressBreakpoint(instructionAddressAt(listing, call)!, 'crackme')
        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        await emulator.run(0)
        expect(emulator.line).toBe(call)
        const line = passwordCheck(listing)
        await patch(patcher, line, 'je .LAB_2')
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('Correct!')

        //everything after the stop is undone, the patch with it: puts writes and exits, all of
        //which the history records (the read before it and stdio's brk are not, so a patch made
        //before them cannot be taken back once a Run has gone past them)
        const rows = (
            emulator as unknown as {
                _getUndoHistoryRange(skip: number, max: number): { kind: string }[]
            }
        )._getUndoHistoryRange(0, 100_000)
        const back = rows.findIndex((row) => row.kind === 'poke') + 1
        expect(back).toBeGreaterThan(1)
        expect(emulator.undo(back)).toBe(back)
        expect(emulator.terminated).toBe(false)
        expect(emulator.line).toBe(call)
        expect(patcher.patched).toBeUndefined()
        expect(patcher.site(line)!.text).toBe('jne .LAB_2')
        await emulator.run(0)
        expect(emulator.stdOut).toContain('Wrong!')
    })

    it('patches a patched line again, each patch one Undo step', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        await patch(patcher, line, 'je .LAB_2')
        //the prompt starts from what the line shows now
        expect(patcher.site(line)!.text).toBe('je .LAB_2')
        await patch(patcher, line, 'jmp .LAB_2')
        expect(patcher.patched!.lines.get(line)!.text).toBe('    jmp .LAB_2')
        expect(emulator.latestSteps[0].title).toMatch(/^Patched je → jmp at 0x/)

        emulator.undo(1)
        expect(patcher.patched!.lines.get(line)!.text).toBe('    je .LAB_2')
        emulator.undo(1)
        expect(patcher.patched).toBeUndefined()
    })

    it('pads a shorter instruction with nop, shown on the same line', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = lineOf(listing, 'mov eax, 0x00', lineOf(listing, '.LAB_3:'))
        const site = patcher.site(line)!
        expect(site.length).toBe(5)
        const preview = await patch(patcher, line, 'xor eax, eax')
        expect(hex(preview.bytes)).toBe('31 c0 90 90 90')
        expect(preview.encodedLength).toBe(2)
        expect(preview.line.comments).toEqual(['+ 3 nops'])
        const shown = patcher.patched!.lines.get(line)!.text
        expect(shown).toMatch(/^ {4}xor eax, eax {2,}; \+ 3 nops$/)
        //the comment starts where the Listing's comments do
        expect(shown.indexOf(';')).toBe(
            lines(listing)[lineOf(listing, 'lea rax, [rel s_Correct]')].indexOf(';')
        )
        expect(emulator.latestSteps[0].title).toMatch(
            /^Patched mov eax, 0x00 → xor eax, eax \+ 3 nops at 0x/
        )
        expect(lines(patcher.patched!.listing).length).toBe(lines(listing).length)

        emulator.peripherals.terminal.useScriptedInput(['hunter2'])
        await emulator.run(0)
        expect(emulator.stdOut).toContain('Correct!')
        expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
    })

    it('refuses an instruction longer than the one it replaces, writing nothing', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        const site = patcher.site(line)!
        const before = hex(emulator.readMemoryBytes(site.address, 2))
        //a conditional jump this far back takes a 32-bit displacement
        const preview = await patcher.preview(site, 'je strcmp@plt')
        expect(preview).toMatchObject({
            ok: false,
            error: 'The new instruction needs 6 bytes, the instruction it replaces has 2; it would overwrite the next instruction'
        })
        expect(patcher.apply(preview)).toBe(false)
        expect(hex(emulator.readMemoryBytes(site.address, 2))).toBe(before)
        expect(emulator.latestSteps[0]?.kind).not.toBe('poke')
    })

    it('keeps labels on a rewritten operand and names an unknown one', async () => {
        const { listing, patcher } = await built('crackme')
        const line = lineOf(listing, 'lea rax, [rel s_Wrong]')
        const site = patcher.site(line)!
        expect(site.text).toBe('lea rax, [rel s_Wrong]')
        const preview = ok(await patcher.preview(site, 'lea rax, [rel s_Correct]'))
        expect(preview.line.instruction).toBe('lea rax, [rel s_Correct]')
        expect(preview.line.comments).toEqual(['"Correct!"'])
        //the same instruction is already there
        expect(ok(await patcher.preview(site, site.text)).unchanged).toBe(true)
        expect(await patcher.preview(site, 'lea rax, [rel s_Nothing]')).toMatchObject({
            ok: false,
            error: 'There is no label named s_Nothing in this Listing'
        })
        expect(await patcher.preview(site, 'jne .LAB_9')).toMatchObject({
            ok: false,
            error: expect.stringContaining('There is no .LAB_9 in main')
        })
        //an offset the Listing has no label for keeps the name it was written with
        const offset = ok(await patcher.preview(site, 'lea rax, [rel s_Correct+0x2]'))
        expect(offset.line.instruction).toBe('lea rax, [rel s_Correct+0x2]')
        //what the assembler says reaches the prompt
        expect(await patcher.preview(site, 'lea rax, [rel s_Correct')).toMatchObject({ ok: false })
    })

    it('stops on a Breakpoint on a patched line, which shows the patch', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        await patch(patcher, line, 'je .LAB_2')
        const address = instructionAddressAt(listing, line)!
        emulator.toggleAddressBreakpoint(address, 'crackme')
        emulator.peripherals.terminal.useScriptedInput(['swordfish'])
        await emulator.run(0)
        expect(emulator.terminated).toBe(false)
        expect(emulator.pc).toBe(BigInt(address + PIE_LOAD_BASE))
        expect(emulator.line).toBe(line)
        expect(patcher.patched!.lines.get(line)!.text).toBe('    je .LAB_2')
        await emulator.run(0)
        expect(emulator.stdOut).toContain('Correct!')
    })

    it('shows bytes poked by hand in the memory view on their line', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        const site = patcher.site(line)!
        //one byte: 75 (jne) to 74 (je), as someone who knows the opcode would
        expect(emulator.pokeMemory(site.address, Uint8Array.of(0x74))).toBe(true)
        expect(patcher.patched!.lines.get(line)!.text).toBe('    je .LAB_2')
        //a write of one byte is not the whole instruction, so the History shows the bytes alone
        expect(emulator.latestSteps[0].title).toBeUndefined()
        emulator.undo(1)
        expect(patcher.patched).toBeUndefined()
    })

    it('starts the next Build with the Executable as it is', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const line = passwordCheck(listing)
        await patch(patcher, line, 'je .LAB_2')
        const sources = executableSources('crackme')
        await emulator.compile(100_000, sources)
        expect(patcher.patched).toBeUndefined()
        const site = patcher.site(line)!
        expect(site.text).toBe('jne .LAB_2')
        expect(emulator.readMemoryBytes(site.address, 1)[0]).toBe(0x75)
    })

    it('takes no patch on a line without an instruction, nor outside a Debug session', async () => {
        const { emulator, listing, patcher } = await built('crackme')
        const label = lineOf(listing, 'main:')
        expect(listing.lines.kinds[label]).toBe(LINE_KIND.label)
        expect(patcher.site(label)).toBeUndefined()
        emulator.clear()
        expect(patcher.site(passwordCheck(listing))).toBeUndefined()
    })
})

describe('patching crackme-argv', () => {
    it('accepts a wrong password from the Arguments once the check is flipped', async () => {
        const { emulator, listing, patcher } = await built('crackme-argv', 'wrong')
        const line = passwordCheck(listing)
        const site = patcher.site(line)!
        expect(site.text).toMatch(/^jne \.LAB_\d+$/)
        await patch(patcher, line, site.text.replace(/^jne/, 'je'))
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('Correct!')
    })
})
