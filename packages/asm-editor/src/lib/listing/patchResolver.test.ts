/**
 * The names a patch may be typed with, replaced by the run-time addresses they stand for before
 * the instruction is assembled ([binary-import.md](../../../../../docs/design/binary-import.md),
 * decision 13): every kind of name crackme's Listing prints, and the words that are not names.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder } from './decoder'
import { generateListing } from './generateListing'
import { LINE_KIND, type Listing, type ListingLabel } from './listing'
import { resolveListingNames, withoutComment } from './patchResolver'

const PIE_BASE = 0x555555554000

const fixture = (name: string) =>
    new Uint8Array(
        readFileSync(
            new URL(`../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    )

let crackme: Listing
let stripped: Listing
beforeAll(async () => {
    const decoder = await loadDecoder()
    const listing = (name: string) =>
        generateListing(decoder, { bytes: fixture(name), name, base: PIE_BASE, version: 'v1' })
    crackme = listing('crackme')
    stripped = listing('crackme-stripped')
})

const textLines = (listing: Listing) => listing.text.split('\n')

/** The first 0-based line from `after` whose code, without its comment, is exactly this. */
function lineOf(listing: Listing, text: string, after = 0): number {
    const line = textLines(listing).findIndex(
        (candidate, k) => k >= after && withoutComment(candidate).trim() === text
    )
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}

/** The password check in main, `jne .LAB_2` after `call strcmp@plt`. */
const checkLine = () => lineOf(crackme, 'jne .LAB_2', lineOf(crackme, 'call strcmp@plt'))

function label(listing: Listing, fullName: string): ListingLabel {
    const found = listing.labels.find((candidate) => candidate.fullName === fullName)
    expect(found, fullName).toBeDefined()
    return found!
}

/** A label's run-time address, as the resolver writes it. */
const at = (listing: Listing, fullName: string, offset = 0) =>
    `0x${(label(listing, fullName).address + listing.base + offset).toString(16)}`

/** Resolves text as typed over a line, which must succeed. */
function resolved(listing: Listing, text: string, line: number) {
    const result = resolveListingNames(text, listing, line)
    if ('error' in result) throw new Error(result.error)
    return result
}

describe('the names a Listing prints', () => {
    it('reads a bare .LAB_n as a block of the line’s own function', () => {
        const line = checkLine()
        expect(resolved(crackme, 'je .LAB_2', line)).toEqual({
            text: `je ${at(crackme, 'main.LAB_2')}`,
            names: [
                {
                    written: '.LAB_2',
                    name: '.LAB_2',
                    address: BigInt(at(crackme, 'main.LAB_2'))
                }
            ]
        })
        //the same name in another function is that function's block
        const other = lineOf(crackme, 'cmp byte [rel completed.0], 0x00')
        expect(resolved(crackme, 'jne .LAB_1', other).text).toBe(
            `jne ${at(crackme, '__do_global_dtors_aux.LAB_1')}`
        )
    })

    it('reads a block’s full name from anywhere', () => {
        const line = lineOf(crackme, 'cmp byte [rel completed.0], 0x00')
        expect(resolved(crackme, 'jmp main.LAB_4', line).text).toBe(
            `jmp ${at(crackme, 'main.LAB_4')}`
        )
    })

    it('reads functions, PLT stubs, GOT slots and invented names', () => {
        const line = lineOf(crackme, 'call strcmp@plt')
        expect(resolved(crackme, 'call strcmp@plt', line).text).toBe(
            `call ${at(crackme, 'strcmp@plt')}`
        )
        expect(resolved(crackme, 'call main', line).text).toBe(`call ${at(crackme, 'main')}`)
        expect(resolved(crackme, 'call qword [rel __libc_start_main@got]', line).text).toBe(
            `call qword [rel ${at(crackme, '__libc_start_main@got')}]`
        )
        expect(resolved(crackme, 'jmp FUN_winged_scarab', line).text).toBe(
            `jmp ${at(crackme, 'FUN_winged_scarab')}`
        )
        //a stripped binary's functions have invented names, and are read the same way
        const invented = stripped.labels.find((candidate) => candidate.origin === 'invented')!
        const strippedLine = lineOf(stripped, 'call strcmp@plt')
        expect(resolved(stripped, `call ${invented.fullName}`, strippedLine).text).toBe(
            `call 0x${(invented.address + PIE_BASE).toString(16)}`
        )
    })

    it('reads data labels, strings, versioned names and names with dots', () => {
        const line = lineOf(crackme, 'lea rax, [rel s_Wrong]')
        expect(resolved(crackme, 'lea rax, [rel s_Correct]', line).text).toBe(
            `lea rax, [rel ${at(crackme, 's_Correct')}]`
        )
        expect(resolved(crackme, 'lea rdx, [rel DAT_nimble_sandpiper]', line).text).toBe(
            `lea rdx, [rel ${at(crackme, 'DAT_nimble_sandpiper')}]`
        )
        expect(resolved(crackme, 'mov rdx, [rel stdin@GLIBC_2.2.5]', line).text).toBe(
            `mov rdx, [rel ${at(crackme, 'stdin@GLIBC_2.2.5')}]`
        )
        expect(resolved(crackme, 'mov byte [rel completed.0], 0x01', line).text).toBe(
            `mov byte [rel ${at(crackme, 'completed.0')}], 0x01`
        )
    })

    it('folds an offset into the address', () => {
        const line = lineOf(crackme, 'lea rax, [rel s_Wrong]')
        const result = resolved(crackme, 'lea rax, [rel s_hunter2+0x2]', line)
        expect(result.text).toBe(`lea rax, [rel ${at(crackme, 's_hunter2', 2)}]`)
        expect(result.names).toEqual([
            {
                written: 's_hunter2+0x2',
                name: 's_hunter2',
                address: BigInt(at(crackme, 's_hunter2', 2))
            }
        ])
        expect(resolved(crackme, 'lea rax, [rel s_hunter2 - 3]', line).text).toBe(
            `lea rax, [rel ${at(crackme, 's_hunter2', -3)}]`
        )
        expect(resolved(crackme, 'jmp main+0x10', line).text).toBe(
            `jmp ${at(crackme, 'main', 0x10)}`
        )
        //an offset that something binds tighter to, or a name that is subtracted, stays as written
        expect(resolved(crackme, 'mov eax, s_hunter2+2*4', line).text).toBe(
            `mov eax, ${at(crackme, 's_hunter2')}+2*4`
        )
        expect(resolved(crackme, 'mov eax, 0x10-s_hunter2+1', line).text).toBe(
            `mov eax, 0x10-${at(crackme, 's_hunter2')}+1`
        )
    })

    it('wraps an offset past the end of the address space to 64 bits', () => {
        const line = lineOf(crackme, 'lea rax, [rel s_Wrong]')
        const result = resolved(crackme, 'mov rax, main-0x600000000000', line)
        const address = BigInt.asUintN(64, BigInt(at(crackme, 'main')) - 0x600000000000n)
        expect(result.text).toBe(`mov rax, 0x${address.toString(16)}`)
    })

    it('reads several names in one instruction', () => {
        const line = lineOf(crackme, 'lea rax, [rel s_Wrong]')
        const result = resolved(crackme, 'cmovne rax, [rel s_Wrong]', line)
        expect(result.names).toHaveLength(1)
        const two = resolved(crackme, 'mov qword [rel completed.0], main', line)
        expect(two.text).toBe(
            `mov qword [rel ${at(crackme, 'completed.0')}], ${at(crackme, 'main')}`
        )
        expect(two.names.map((name) => name.name)).toEqual(['completed.0', 'main'])
    })
})

describe('words that are not names', () => {
    const line = () => lineOf(crackme, 'lea rax, [rel s_Wrong]')
    const unchanged = [
        'mov byte [rbp+rax*1-0x90], 0x00',
        'mov rax, fs:[0x28]',
        'nop word cs:[rax+rax*1]',
        'sub rdx, fs:[0x28]',
        'movaps xmm0, [rsp+0x10]',
        'vpbroadcastb ymm0, xmm0',
        'fadd to st1',
        'kmovw k1, eax',
        'mov r8d, r15d',
        'mov sil, dil',
        'mov rax, cr0',
        'push qword 0x10',
        'call far dword [rax]',
        'jmp short 0x555555555291',
        'jmp near 0x555555555291',
        'mov eax, [abs 0x404000]',
        'push strict dword 5',
        'jmp $',
        'jmp $$',
        'mov eax, $0ff',
        'mov eax, 0ffh',
        'mov eax, 10b',
        'mov RAX, RBX',
        'ret',
        'endbr64',
        'syscall'
    ]
    for (const text of unchanged)
        it(`leaves ${text} as it is`, () => {
            expect(resolved(crackme, text, line())).toEqual({ text, names: [] })
        })

    it('never reads the mnemonic or a prefix as a name', () => {
        //`main` is a label, but as a mnemonic it is the assembler's to refuse
        expect(resolved(crackme, 'main rax', line())).toEqual({ text: 'main rax', names: [] })
        expect(resolved(crackme, 'lock add [rel completed.0], eax', line()).text).toBe(
            `lock add [rel ${at(crackme, 'completed.0')}], eax`
        )
        expect(resolved(crackme, 'bnd jmp strcmp@plt', line()).text).toBe(
            `bnd jmp ${at(crackme, 'strcmp@plt')}`
        )
        expect(resolved(crackme, 'rep movsb', line()).text).toBe('rep movsb')
        expect(resolved(crackme, 'notrack jmp rax', line()).text).toBe('notrack jmp rax')
    })

    it('leaves quoted characters, {…} decorators and comments alone', () => {
        expect(resolved(crackme, "mov eax, 'main'", line()).text).toBe("mov eax, 'main'")
        expect(resolved(crackme, 'mov eax, "s_Correct"', line()).text).toBe('mov eax, "s_Correct"')
        expect(resolved(crackme, 'vaddps zmm0{k1}{z}, zmm1, [rax]{1to16}', line()).text).toBe(
            'vaddps zmm0{k1}{z}, zmm1, [rax]{1to16}'
        )
        expect(resolved(crackme, '{vex} vpdpbusd xmm0, xmm1, xmm2', line()).text).toBe(
            '{vex} vpdpbusd xmm0, xmm1, xmm2'
        )
        expect(
            resolved(crackme, 'lea rax, [rel s_Correct]            ; "Correct!" main', line())
        ).toEqual({
            text: `lea rax, [rel ${at(crackme, 's_Correct')}]`,
            names: [expect.objectContaining({ name: 's_Correct' })]
        })
        expect(resolved(crackme, "mov al, ';' ; s_nothing", line()).text).toBe("mov al, ';'")
    })

    it('reads a name marked with $ even where it is also one of NASM’s words', () => {
        expect(resolved(crackme, 'call $main', line()).text).toBe(`call ${at(crackme, 'main')}`)
    })
})

describe('a name NASM also reserves', () => {
    /** One function named `abs`, as static glibc has, and one named `to`, called from main. */
    function listingWith(names: string[]): Listing {
        const labels: ListingLabel[] = names.map((name, k) => ({
            name,
            fullName: name,
            kind: 'function',
            origin: 'symbol',
            address: 0x1000 + 0x10 * k,
            line: k
        }))
        return {
            version: 'v1',
            base: 0x400000,
            text: names.map((name) => `${name}:`).join('\n'),
            lines: {
                kinds: Uint8Array.from(names.map(() => LINE_KIND.label)),
                addresses: Float64Array.from(labels.map((label) => label.address)),
                sizes: new Float64Array(names.length),
                offsets: new Float64Array(names.length).fill(-1),
                byAddress: new Int32Array()
            },
            labels,
            functions: labels.map((label) => ({
                name: label.name,
                address: label.address,
                end: label.address + 0x10,
                line: label.line,
                endLine: label.line + 1
            })),
            entry: 0x1000
        }
    }

    it('is a branch target when it is all the operand is', () => {
        const listing = listingWith(['abs', 'to'])
        expect(resolved(listing, 'call abs', 0).text).toBe('call 0x401000')
        expect(resolved(listing, 'jmp short to', 0).text).toBe('jmp short 0x401010')
        //anywhere else it is NASM's word
        expect(resolved(listing, 'mov eax, [abs 0x10]', 0).text).toBe('mov eax, [abs 0x10]')
        expect(resolved(listing, 'fadd to st1', 0).text).toBe('fadd to st1')
    })
})

describe('names the Listing does not have', () => {
    it('names the label', () => {
        const line = checkLine()
        expect(resolveListingNames('call strcmp_plt', crackme, line)).toEqual({
            error: 'There is no label named strcmp_plt in this Listing'
        })
        expect(resolveListingNames('jmp FUN_brave_otter.LAB_1', crackme, line)).toEqual({
            error: 'There is no label named FUN_brave_otter.LAB_1 in this Listing'
        })
    })

    it('says which function a bare block was looked for in', () => {
        const line = checkLine()
        expect(resolveListingNames('je .LAB_9', crackme, line)).toEqual({
            error: 'There is no .LAB_9 in main: a bare .LAB_n names a block of the function the line is in'
        })
        //a line outside every function, such as the header
        expect(resolveListingNames('je .LAB_1', crackme, 0)).toEqual({
            error: ".LAB_1 names a block of the function the line is in, and this line is in none: write the block's full name, such as FUN_name.LAB_1"
        })
    })
})
