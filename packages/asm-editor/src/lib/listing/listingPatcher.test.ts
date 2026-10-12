/**
 * The patcher over crackme's Listing with memory kept by the test: how a patched line reads, what
 * pads it, what the History calls it, and which lines it reads again
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13). The Emulator's
 * own tests (`X86Patch.test.ts`) run the same patches on the Core.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder, type ListingDecoder } from './decoder'
import { generateListing } from './generateListing'
import { lineOfAddress, type Listing } from './listing'
import type { ListingDocument } from './listingDocuments.svelte'
import { ListingPatcher, type PatchPreview } from './listingPatcher.svelte'
import {
    addressName,
    describeLine,
    fitPatch,
    instructionText,
    patchTitle,
    withLines
} from './patchFormat'
import { withoutComment } from './patchResolver'

const PIE_BASE = 0x555555554000
const bytes = new Uint8Array(
    readFileSync(new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url))
)

let decoder: ListingDecoder
let listing: Listing
beforeAll(async () => {
    decoder = await loadDecoder()
    listing = generateListing(decoder, { bytes, name: 'crackme', base: PIE_BASE, version: 'v1' })
})

function lineOf(text: string, after = 0): number {
    const line = listing.text
        .split('\n')
        .findIndex((candidate, k) => k >= after && withoutComment(candidate).trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}
const checkLine = () => lineOf('jne .LAB_2', lineOf('call strcmp@plt'))
const runTime = (line: number) => BigInt(listing.lines.addresses[line] + PIE_BASE)
const labelAddress = (fullName: string) =>
    BigInt(listing.labels.find((label) => label.fullName === fullName)!.address + PIE_BASE)

/** Memory as the program would see it: the file's bytes, and whatever the test pokes over them. */
function fakeHost(assembled: Record<string, number[]> = {}) {
    const document = { listing, bytes, base: PIE_BASE } as unknown as ListingDocument
    const poked = new Map<number, number>()
    let running = true
    const byteAt = (link: number) => {
        const line = lineOfAddress(listing, link)
        const offset = listing.lines.offsets[line]
        return poked.get(link) ?? bytes[offset + link - listing.lines.addresses[line]]
    }
    const pokes: { address: bigint; bytes: number[] }[] = []
    const patcher: ListingPatcher = new ListingPatcher({
        executable: () => (running ? { path: 'crackme', document } : undefined),
        readMemory: (address, length) =>
            Uint8Array.from({ length }, (_, k) => byteAt(Number(address) - PIE_BASE + k)),
        poke: (address, written) => {
            written.forEach((byte, k) => poked.set(Number(address) - PIE_BASE + k, byte))
            pokes.push({ address, bytes: [...written] })
            patcher.touched(address, written.length)
            return true
        },
        decoder: () => decoder,
        loadDecoder: async () => decoder,
        assemble: async (text) =>
            text in assembled
                ? { bytes: Uint8Array.from(assembled[text]) }
                : { error: `no ${text}` }
    })
    return {
        patcher,
        document,
        pokes,
        /** Takes a write back, as an Undo would, and refreshes as the Emulator then does. */
        unpoke(address: bigint, length: number) {
            for (let k = 0; k < length; k++) poked.delete(Number(address) - PIE_BASE + k)
            patcher.refresh()
        },
        poke(address: bigint, written: number[]) {
            written.forEach((byte, k) => poked.set(Number(address) - PIE_BASE + k, byte))
            patcher.touched(address, written.length)
            patcher.refresh()
        },
        end() {
            running = false
        }
    }
}

const ok = (preview: PatchPreview) => {
    if (!preview.ok) throw new Error(preview.error)
    return preview
}

describe('the bytes a patch writes', () => {
    it('are the encoding padded with nop, or a refusal when it is longer', () => {
        expect([
            ...(fitPatch(Uint8Array.of(0x74, 0x10), 2) as { bytes: Uint8Array }).bytes
        ]).toEqual([0x74, 0x10])
        expect([
            ...(fitPatch(Uint8Array.of(0x31, 0xc0), 5) as { bytes: Uint8Array }).bytes
        ]).toEqual([0x31, 0xc0, 0x90, 0x90, 0x90])
        expect(fitPatch(new Uint8Array(6), 2)).toEqual({
            error: 'The new instruction needs 6 bytes, the instruction it replaces has 2; it would overwrite the next instruction'
        })
    })
})

describe('naming a patched line’s targets', () => {
    it('names a block as the Listing does from that line', () => {
        const target = labelAddress('main.LAB_2')
        expect(addressName(listing, target, checkLine())).toBe('.LAB_2')
        //from another function it takes the function's name
        expect(addressName(listing, target, lineOf('cmp byte [rel completed.0], 0x00'))).toBe(
            'main.LAB_2'
        )
    })

    it('names labels, offsets into functions, and what the line was written with', () => {
        const line = checkLine()
        expect(addressName(listing, labelAddress('strcmp@plt'), line)).toBe('strcmp@plt')
        expect(addressName(listing, labelAddress('s_Correct'), line)).toBe('s_Correct')
        expect(addressName(listing, labelAddress('main') + 4n, line)).toBe('main+0x4')
        const inside = labelAddress('s_hunter2') + 2n
        expect(addressName(listing, inside, line)).toBeUndefined()
        expect(addressName(listing, inside, line, new Map([[inside, 's_hunter2+0x2']]))).toBe(
            's_hunter2+0x2'
        )
        //a label at exactly the address wins over a name it was written with
        expect(
            addressName(listing, labelAddress('main'), line, new Map([[labelAddress('main'), 'x']]))
        ).toBe('main')
    })

    it('describes padding as nops and anything else by its instruction', () => {
        const line = checkLine()
        const address = runTime(line)
        const padded = describeLine(
            decoder.disassemble(Uint8Array.of(0x31, 0xc0, 0x90, 0x90, 0x90), address),
            listing,
            bytes,
            line
        )
        expect(padded).toMatchObject({ instruction: 'xor eax, eax', rest: ['+ 3 nops'] })
        expect(padded.text).toBe(`${'    xor eax, eax'.padEnd(39)} ; + 3 nops`)
        const one = describeLine(
            decoder.disassemble(Uint8Array.of(0x31, 0xc0, 0x90), address),
            listing,
            bytes,
            line
        )
        expect(one.rest).toEqual(['+ 1 nop'])
        const mixed = describeLine(
            decoder.disassemble(Uint8Array.of(0x90, 0x50, 0x90, 0x90), address),
            listing,
            bytes,
            line
        )
        expect(mixed).toMatchObject({ instruction: 'nop', rest: ['+ push rax', '+ 2 nops'] })
        //a string the instruction reaches is quoted, as the Listing quotes it
        const lea = lineOf('lea rax, [rel s_Wrong]')
        const original = describeLine(
            decoder.disassemble(
                bytes.subarray(listing.lines.offsets[lea], listing.lines.offsets[lea] + 7),
                runTime(lea)
            ),
            listing,
            bytes,
            lea
        )
        expect(original.text).toBe(listing.text.split('\n')[lea])
    })

    it('titles a patch by its mnemonics when only they changed', () => {
        const line = (instruction: string, rest: string[] = []) => ({
            instruction,
            rest,
            comments: rest,
            text: ''
        })
        expect(patchTitle(line('jne .LAB_2'), line('je .LAB_2'), 0x5555555551f8n)).toBe(
            'Patched jne → je at 0x5555555551f8'
        )
        expect(patchTitle(line('mov eax, 0x00'), line('xor eax, eax', ['+ 3 nops']), 0x10n)).toBe(
            'Patched mov eax, 0x00 → xor eax, eax + 3 nops at 0x10'
        )
        expect(patchTitle(line('mov eax, 0x00'), line('mov eax, 0x01'), 0x10n)).toBe(
            'Patched mov eax, 0x00 → mov eax, 0x01 at 0x10'
        )
    })

    it('replaces only the patched lines of a Listing’s text', () => {
        const line = checkLine()
        const replaced = withLines(listing, [[line, '    je .LAB_2']])
        const before = listing.text.split('\n')
        const after = replaced.text.split('\n')
        expect(after).toHaveLength(before.length)
        expect(after[line]).toBe('    je .LAB_2')
        expect(after.filter((text, k) => text !== before[k])).toEqual(['    je .LAB_2'])
        expect(replaced.lines).toBe(listing.lines)
        expect(withLines(listing, [])).toBe(listing)
        expect(instructionText(listing, lineOf('lea rax, [rel s_Wrong]'))).toBe(
            'lea rax, [rel s_Wrong]'
        )
        expect(instructionText(listing, lineOf('main:'))).toBe('')
    })
})

describe('the patcher', () => {
    it('previews, writes and shows a patch, and forgets it when memory is the file’s again', async () => {
        const line = checkLine()
        const address = runTime(line)
        const target = labelAddress('main.LAB_2')
        const je = `je 0x${target.toString(16)}`
        const displacement = Number(target - address - 2n)
        const host = fakeHost({ [je]: [0x74, displacement] })
        const site = host.patcher.site(line)!
        expect(site.text).toBe('jne .LAB_2')
        const preview = ok(await host.patcher.preview(site, 'je .LAB_2'))
        expect(preview.line.instruction).toBe('je .LAB_2')
        expect(host.patcher.apply(preview)).toBe(true)
        expect(host.pokes).toEqual([{ address, bytes: [0x74, displacement] }])
        const patched = host.patcher.patched!
        expect(patched.lines.get(line)).toMatchObject({
            text: '    je .LAB_2',
            instruction: 'je .LAB_2',
            originalText: 'jne .LAB_2'
        })
        //nothing changed, so the same value: what shows it is not redrawn at every refresh
        host.patcher.refresh()
        expect(host.patcher.patched).toBe(patched)
        expect(
            host.patcher.title({ address, old: [0x75, displacement], new: [0x74, displacement] })
        ).toBe(`Patched jne → je at 0x${address.toString(16)}`)
        //a write of part of the instruction, or of more than it, is no patch of it
        expect(host.patcher.title({ address, old: [0x75], new: [0x74] })).toBeUndefined()
        expect(
            host.patcher.title({ address: address + 1n, old: [1, 2], new: [3, 4] })
        ).toBeUndefined()

        host.unpoke(address, 2)
        expect(host.patcher.patched).toBeUndefined()
        expect(host.patcher.site(line)!.text).toBe('jne .LAB_2')
    })

    it('writes nothing for an unchanged preview, or once the session has ended', async () => {
        const line = lineOf('lea rax, [rel s_Wrong]')
        const lea = [
            ...bytes.subarray(listing.lines.offsets[line], listing.lines.offsets[line] + 7)
        ]
        const target = labelAddress('s_Wrong')
        const host = fakeHost({ [`lea rax, [rel 0x${target.toString(16)}]`]: lea })
        const site = host.patcher.site(line)!
        const same = ok(await host.patcher.preview(site, site.text))
        expect(same.unchanged).toBe(true)
        expect(host.patcher.apply(same)).toBe(false)
        host.end()
        expect(await host.patcher.preview(site, site.text)).toMatchObject({
            ok: false,
            error: 'The Debug session this line belongs to has ended'
        })
        expect(host.patcher.site(line)).toBeUndefined()
        expect(host.pokes).toEqual([])
    })

    it('reports an assembler that throws as the preview’s error', async () => {
        const host = fakeHost()
        const failing = new ListingPatcher({
            executable: () => ({ path: 'crackme', document: host.document }),
            readMemory: () => undefined,
            poke: () => false,
            decoder: () => decoder,
            loadDecoder: async () => decoder,
            assemble: async () => {
                throw new Error('nasm.wasm could not be loaded')
            }
        })
        expect(await failing.preview(failing.site(checkLine())!, 'je .LAB_2')).toMatchObject({
            ok: false,
            error: 'nasm.wasm could not be loaded'
        })
    })

    it('shows every instruction a hand-made write covers, and refuses what the assembler refuses', async () => {
        const host = fakeHost()
        const line = checkLine()
        const address = runTime(line)
        //two bytes over the end of `test eax, eax` and the start of `jne`: both lines change
        host.poke(address - 1n, [0xc9, 0x74])
        const lines = host.patcher.patched!.lines
        expect([...lines.keys()]).toEqual([line - 1, line])
        expect(lines.get(line)!.instruction).toBe('je .LAB_2')
        expect(await host.patcher.preview(host.patcher.site(line)!, 'je .LAB_2')).toMatchObject({
            ok: false,
            error: expect.stringMatching(/^no je 0x/)
        })
        host.patcher.clear()
        expect(host.patcher.patched).toBeUndefined()
    })
})
