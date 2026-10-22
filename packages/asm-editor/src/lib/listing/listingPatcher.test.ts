/**
 * The patcher over crackme's Listing with memory kept by the test: how a patched line reads, what
 * pads it, what the History calls it, and which lines it reads again
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13). The Emulator's
 * own tests (`X86Patch.test.ts`) run the same patches on the Core.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDemangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from './decoder'
import { generateListing } from './generateListing'
import { LINE_KIND, lineOfAddress, type Listing } from './listing'
import type { ListingDocument } from './listingDocuments.svelte'
import { ListingIndex } from './listingNavigation'
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
    let document = { listing, bytes, base: PIE_BASE } as unknown as ListingDocument
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
        },
        /** The session's Listing made again, as a rename or a comment during it makes it. */
        show(next: Listing) {
            document = { listing: next, bytes, base: PIE_BASE } as unknown as ListingDocument
            patcher.refresh()
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
        //inside a string or an object, as the generator names it: `name+0xN`
        const inside = labelAddress('s_hunter2') + 2n
        expect(addressName(listing, inside, line)).toBe('s_hunter2+0x2')
        expect(addressName(listing, labelAddress('stdin@GLIBC_2.2.5') + 4n, line)).toBe(
            'stdin@GLIBC_2.2.5+0x4'
        )
        //a name the line was written with comes before that
        expect(addressName(listing, inside, line, new Map([[inside, 'DAT_x']]))).toBe('DAT_x')
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
        //and one that reaches into a string, from there, named inside it
        const into = bytes.slice(listing.lines.offsets[lea], listing.lines.offsets[lea] + 7)
        const view = new DataView(into.buffer)
        view.setInt32(3, view.getInt32(3, true) + 2, true)
        const inside = describeLine(decoder.disassemble(into, runTime(lea)), listing, bytes, lea)
        expect(inside.instruction).toBe('lea rax, [rel s_Wrong+0x2]')
        expect(inside.comments).toEqual(['"ong!"'])
    })

    it("says a C++ program's demangled names as the Listing does, offsets and all", async () => {
        const cpp = new Uint8Array(
            readFileSync(
                new URL('../../../../x86/blink-js/tests/fixtures/elf/cpp', import.meta.url)
            )
        )
        const named = generateListing(decoder, {
            bytes: cpp,
            name: 'cpp',
            base: PIE_BASE,
            version: 'v1',
            demangler: await loadDemangler()
        })
        const lines = named.text.split('\n')
        const { kinds, offsets, sizes } = named.lines
        const own = (line: number) => cpp.subarray(offsets[line], offsets[line] + sizes[line])
        const described = (code: Uint8Array, line: number) =>
            describeLine(
                decoder.disassemble(code, BigInt(named.lines.addresses[line] + PIE_BASE)),
                named,
                cpp,
                line
            )
        //every commented instruction, described from its own bytes, reads as the Listing has it
        let commented = 0
        lines.forEach((text, line) => {
            if (kinds[line] !== LINE_KIND.instruction || !text.includes(' ; ')) return
            commented++
            expect(described(own(line), line).text, text).toBe(text)
        })
        expect(commented).toBeGreaterThan(50)
        //a call made to go elsewhere says its new target
        const label = (name: string) => named.labels.find((candidate) => candidate.name === name)!
        const call = lines.findIndex((text) =>
            text.startsWith('    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev ')
        )
        const retargeted = own(call).slice()
        const target = label('_Znwm@plt').address
        new DataView(retargeted.buffer).setInt32(
            1,
            target - (named.lines.addresses[call] + sizes[call]),
            true
        )
        expect(described(retargeted, call)).toMatchObject({
            instruction: 'call _Znwm@plt',
            comments: ['operator new(unsigned long)'],
            text: `${'    call _Znwm@plt'.padEnd(39)} ; operator new(unsigned long)`
        })
        //and an operand reaching into a datum with a demangled name says the offset
        const lea = lines.findIndex((text) =>
            text.startsWith('    lea rax, [rel _ZTISt13runtime_error@GLIBCXX_3.4]')
        )
        const into = own(lea).slice()
        const view = new DataView(into.buffer)
        view.setInt32(3, view.getInt32(3, true) + 8, true)
        const inside = described(into, lea)
        expect(inside.instruction).toBe('lea rax, [rel _ZTISt13runtime_error@GLIBCXX_3.4+0x8]')
        expect(inside.comments).toEqual(['typeinfo for std::runtime_error+0x8'])
        //the patched Listing's text still keeps the comment's words from reading as names
        const patched = withLines(named, [[lea, inside.text]])
        const shown = patched.text.split('\n')[lea]
        const index = ListingIndex.of(patched)
        expect(index.inDemangledComment(shown, lea, shown.indexOf('std::'))).toBe(true)
        expect(index.inDemangledComment(shown, lea, shown.indexOf('+0x8]') + 2)).toBe(false)
        expect(index.inDemangledComment(shown, lea, shown.lastIndexOf('+0x8') + 2)).toBe(true)
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

    it("keeps a person's comment at the end of a patched line", () => {
        const check = checkLine()
        const lea = lineOf('lea rax, [rel s_Wrong]')
        const strcmp = lineOf('call strcmp@plt')
        const address = (line: number) => listing.lines.addresses[line]
        const annotated = generateListing(decoder, {
            bytes,
            name: 'crackme',
            base: PIE_BASE,
            version: 'v1',
            annotations: {
                comments: new Map([
                    [address(check), 'the check'],
                    [address(lea), 'says no'],
                    [
                        address(strcmp),
                        'a comment too long for the end of its line, so written above it'
                    ]
                ])
            }
        })
        const lines = annotated.text.split('\n')
        // One comment line above `call strcmp@plt` moves every line after it down by one.
        const moved = (line: number) => (line > strcmp ? line + 1 : line)
        const je = describeLine(
            decoder.disassemble(
                Uint8Array.of(0x74, bytes[listing.lines.offsets[check] + 1]),
                runTime(check)
            ),
            annotated,
            bytes,
            moved(check)
        )
        expect(je.text).toBe(`${'    je .LAB_2'.padEnd(39)} ; the check`)
        expect(je.comments).toEqual([])
        const padded = describeLine(
            decoder.disassemble(Uint8Array.of(0x90, 0x90), runTime(check)),
            annotated,
            bytes,
            moved(check)
        )
        expect(padded.text).toBe(`${'    nop'.padEnd(39)} ; + 1 nop ; the check`)
        //the line as the Listing wrote it, its string's comment first
        const original = describeLine(
            decoder.disassemble(
                bytes.subarray(listing.lines.offsets[lea], listing.lines.offsets[lea] + 7),
                runTime(lea)
            ),
            annotated,
            bytes,
            moved(lea)
        )
        expect(original.text).toBe(lines[moved(lea)])
        expect(original.text.endsWith(' ; "Wrong!" ; says no')).toBe(true)
        //a comment above a line stays there, and the line's own text has none
        const call = describeLine(
            decoder.disassemble(
                bytes.subarray(listing.lines.offsets[strcmp], listing.lines.offsets[strcmp] + 5),
                runTime(strcmp)
            ),
            annotated,
            bytes,
            moved(strcmp)
        )
        expect(call.text).toBe('    call strcmp@plt')
        //the patched text keeps its comment's words out of navigation
        const patched = withLines(annotated, [[moved(check), padded.text]])
        const index = ListingIndex.of(patched)
        const shown = patched.text.split('\n')[moved(check)]
        expect(shown).toBe(padded.text)
        expect(index.inPersonComment(shown, moved(check), shown.indexOf('check'))).toBe(true)
        expect(index.inPersonComment(shown, moved(check), shown.indexOf('nop'))).toBe(false)
        expect(instructionText(annotated, moved(check))).toBe('jne .LAB_2')
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

    it('keeps a patch on its instruction in a Listing made again with comment lines above it', async () => {
        const line = checkLine()
        const address = runTime(line)
        const target = labelAddress('main.LAB_2')
        const je = `je 0x${target.toString(16)}`
        const displacement = Number(target - address - 2n)
        const host = fakeHost({ [je]: [0x74, displacement] })
        expect(
            host.patcher.apply(ok(await host.patcher.preview(host.patcher.site(line)!, je)))
        ).toBe(true)
        expect([...host.patcher.patched!.lines.keys()]).toEqual([line])
        //two lines of a comment above `call strcmp@plt`, and one at the end of the patched line
        const call = lineOf('call strcmp@plt')
        const commented = generateListing(decoder, {
            bytes,
            name: 'crackme',
            base: PIE_BASE,
            version: 'v1',
            annotations: {
                comments: new Map([
                    [listing.lines.addresses[call], 'the check\nitself'],
                    [listing.lines.addresses[line], 'flipped']
                ])
            }
        })
        host.show(commented)
        const patched = host.patcher.patched!
        expect(patched.document.listing).toBe(commented)
        expect([...patched.lines.keys()]).toEqual([line + 2])
        expect(patched.lines.get(line + 2)?.text).toMatch(/^ {4}je \.LAB_2 +; flipped$/)
        expect(patched.listing.text.split('\n')[line + 2]).toBe(patched.lines.get(line + 2)?.text)
        expect(host.patcher.site(line + 2)!.text).toBe('je .LAB_2')
        expect(
            host.patcher.title({
                address,
                old: [0x75, displacement],
                new: [0x74, displacement]
            })
        ).toBe(`Patched jne → je at 0x${address.toString(16)}`)
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
