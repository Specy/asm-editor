import { describe, expect, it } from 'vitest'
import {
    COMPACT_SCALE,
    decodeDouble,
    decodeSingle,
    encodeDouble,
    encodeSingle,
    formatFloat32,
    formatFloat64,
    isNanBoxed,
    parseRegisterPoke,
    registerColumnWidth,
    registerFileWidth,
    renderRegister,
    type RegisterFileRendering,
    type RenderableRegister
} from '$lib/languages/registerFormats'
import {
    makeRegister,
    type RegisterFileDescriptor,
    type RegisterFormat,
    RegisterSize,
    resolveRegisterFileLayout
} from '$lib/languages/commonLanguageFeatures.svelte'

/**
 * The decoding and the per-file reading rules of the Register files, tested on bit patterns rather
 * than through a panel: these are the places where MARS's pairing, RARS's NaN-boxing and the
 * shortest round-tripping decimal are decided.
 */

function value(bits: bigint, prev = bits): RenderableRegister {
    return { name: 'r', value: bits, prev }
}

function rendering(
    descriptor: Omit<RegisterFileDescriptor, 'id' | 'label'>
): RegisterFileRendering {
    const file = { id: 'test', label: 'Test', ...descriptor }
    return { ...file, layout: resolveRegisterFileLayout(file) }
}

const mipsFpu = rendering({
    size: RegisterSize.Long,
    formats: ['single', 'double', 'hex'],
    pairedDoubles: true,
    registers: [{ name: '$f0' }, { name: '$f1' }]
})

const riscvFpu = rendering({
    size: RegisterSize.Double,
    formats: ['single', 'double', 'hex'],
    nanBoxedSingles: true,
    registers: [{ name: 'ft0' }]
})

const sse = rendering({
    size: RegisterSize.Quad,
    formats: ['double', 'single', 'hex'],
    registers: [{ name: 'xmm0' }, { name: 'mxcsr', size: RegisterSize.Long, kind: 'integer' }]
})

describe('decoding', () => {
    it('reads the low word as a single and the low 64 bits as a double', () => {
        expect(decodeSingle(0x3fc00000n)).toBe(1.5)
        //the high word is not part of a single, boxed or not
        expect(decodeSingle(0xffffffff3fc00000n)).toBe(1.5)
        expect(decodeDouble(0x3ff8000000000000n)).toBe(1.5)
    })

    it('reads the signed zeroes, the infinities and NaN', () => {
        expect(Object.is(decodeSingle(0x80000000n), -0)).toBe(true)
        expect(decodeSingle(0x7f800000n)).toBe(Infinity)
        expect(decodeSingle(0xff800000n)).toBe(-Infinity)
        expect(Number.isNaN(decodeSingle(0x7fc00000n))).toBe(true)
    })

    it('reads a denormal', () => {
        expect(decodeSingle(0x00000001n)).toBe(1.401298464324817e-45)
        expect(decodeDouble(0x0000000000000001n)).toBe(5e-324)
    })

    it('recognises a NaN-boxed single by its high word alone', () => {
        expect(isNanBoxed(0xffffffff40400000n)).toBe(true)
        expect(isNanBoxed(0x3ff8000000000000n)).toBe(false)
        expect(isNanBoxed(0xfffffffe40400000n)).toBe(false)
    })
})

describe('formatting', () => {
    it('prints the shortest decimal that reads back as the same single', () => {
        expect(formatFloat32(Math.fround(0.1))).toBe('0.1')
        expect(formatFloat32(1.5)).toBe('1.5')
        expect(formatFloat32(decodeSingle(0x40400000n))).toBe('3')
        expect(formatFloat32(Math.fround(1 / 3))).toBe('0.33333334')
        expect(formatFloat32(decodeSingle(0x00000001n))).toBe('1e-45')
    })

    it('spells the values that have no decimal', () => {
        expect(formatFloat32(NaN)).toBe('NaN')
        expect(formatFloat32(Infinity)).toBe('Infinity')
        expect(formatFloat32(-Infinity)).toBe('-Infinity')
        expect(formatFloat32(-0)).toBe('-0')
        expect(formatFloat32(0)).toBe('0')
        expect(formatFloat64(-0)).toBe('-0')
        expect(formatFloat64(NaN)).toBe('NaN')
        expect(formatFloat64(0.1)).toBe('0.1')
    })
})

describe('hex rendering', () => {
    it('groups the bit pattern by the requested size and diffs against the previous one', () => {
        const rendered = renderRegister(
            mipsFpu,
            [value(0x3fc00000n, 0x3fc00001n)],
            0,
            'hex',
            RegisterSize.Word
        )
        expect(rendered.chunks.map((c) => ({ text: c.text, prevText: c.prevText }))).toEqual([
            { text: '3fc0', prevText: '3fc0' },
            { text: '0000', prevText: '0001' }
        ])
        expect(rendered.blank).toBe(false)
    })

    it('carries each group its own reading, which is what the CPU panel hovers', () => {
        const rendered = renderRegister(
            mipsFpu,
            [value(0xffff0002n, 0x00000003n)],
            0,
            'hex',
            RegisterSize.Word
        )
        expect(rendered.chunks.map((c) => c.group)).toEqual([
            { bytes: 2, value: 0xffffn, valueSigned: -1n, prevValue: 0n },
            { bytes: 2, value: 2n, valueSigned: 2n, prevValue: 3n }
        ])
    })

    it('narrows a group to the register it was cut from', () => {
        const rendered = renderRegister(
            mipsFpu,
            [value(0xffffffffn)],
            0,
            'hex',
            RegisterSize.Double
        )
        expect(rendered.chunks[0].group).toEqual({
            bytes: 4,
            value: 0xffffffffn,
            valueSigned: -1n,
            prevValue: 0xffffffffn
        })
    })

    it('reads a narrowed register signed over its own width, as the CPU panel does', () => {
        //Z80 narrows `a` to a byte after its file is built, so a word grouping still yields one
        //byte wide group, and 0xff in it is -1 and not the 255 a word would read. `toSizedGroups`
        //is the CPU panel's path to the same grouping and has to answer the same thing.
        const rendered = renderRegister(
            mipsFpu,
            [{ name: 'a', value: 0xffn, prev: 0xffn, size: RegisterSize.Byte }],
            0,
            'hex',
            RegisterSize.Word
        )
        expect(rendered.chunks).toEqual([
            {
                text: 'ff',
                prevText: 'ff',
                group: { bytes: 1, value: 0xffn, valueSigned: -1n, prevValue: 0xffn }
            }
        ])
        const register = makeRegister('a', 0xffn, RegisterSize.Byte)
        expect(register.toSizedGroups(RegisterSize.Word)).toEqual([
            {
                hex: 'ff',
                value: 0xffn,
                valueSigned: -1n,
                groupSize: 2n,
                prev: { hex: 'ff', value: 0xffn }
            }
        ])
    })

    it('leaves a float lane without a group reading', () => {
        const rendered = renderRegister(riscvFpu, [value(0x3ff8000000000000n)], 0, 'double')
        expect(rendered.chunks[0].group).toBeUndefined()
    })

    it('never groups wider than the register', () => {
        const rendered = renderRegister(
            mipsFpu,
            [value(0x3fc00000n)],
            0,
            'hex',
            RegisterSize.Double
        )
        expect(rendered.chunks.map((c) => c.text)).toEqual(['3fc00000'])
    })

    it('offers the precisions the row is not showing in the hover', () => {
        const rendered = renderRegister(riscvFpu, [value(0x3ff8000000000000n)], 0, 'hex')
        expect(rendered.hover).toEqual(['single NaN', 'double 1.5'])
    })

    it('hovers an integer register with the signed and the unsigned decimal', () => {
        const rendered = renderRegister(sse, [value(0n), value(0xffffffffn)], 1, 'double')
        //the Format is a float one, but `mxcsr` is of integer kind and stays hexadecimal
        expect(rendered.chunks.map((c) => c.text)).toEqual(['ffffffff'])
        expect(rendered.hover).toEqual(['-1', '4294967295'])
    })
})

describe('single rendering', () => {
    it('reads the word of a 32 bit register', () => {
        const registers = [value(0x40400000n, 0x3fc00000n), value(0n)]
        const rendered = renderRegister(mipsFpu, registers, 0, 'single')
        expect(rendered.chunks).toEqual([{ text: '3', prevText: '1.5' }])
        //the other precision of an even row is the pair it is the low word of
        expect(rendered.hover).toEqual(['0x40400000', 'double 5.325712093e-315'])
    })

    it('reads a NaN-boxed value and spells anything else NaN', () => {
        const boxed = renderRegister(riscvFpu, [value(0xffffffff40400000n)], 0, 'single')
        expect(boxed.chunks.map((c) => c.text)).toEqual(['3'])
        expect(boxed.hover).toEqual(['0xffffffff40400000', 'double NaN'])
        const unboxed = renderRegister(riscvFpu, [value(0x3ff8000000000000n)], 0, 'single')
        expect(unboxed.chunks.map((c) => c.text)).toEqual(['NaN'])
        //the same bits still read as a proper double, which is the point of the hover
        expect(unboxed.hover).toEqual(['0x3ff8000000000000', 'double 1.5'])
    })

    it('reads the four lanes of a 128 bit register, lane 0 first', () => {
        const bits =
            (0x40800000n << 96n) | (0x40400000n << 64n) | (0x40000000n << 32n) | 0x3f800000n
        const rendered = renderRegister(sse, [value(bits)], 0, 'single')
        expect(rendered.chunks.map((c) => c.text)).toEqual(['1', '2', '3', '4'])
    })
})

describe('double rendering', () => {
    it('reads a MIPS pair on its even row and blanks the odd one', () => {
        //1.5 as a double is 0x3ff8000000000000: the low word lives in $f0, the high word in $f1
        const registers = [value(0x00000000n), value(0x3ff80000n)]
        const even = renderRegister(mipsFpu, registers, 0, 'double')
        expect(even.chunks.map((c) => c.text)).toEqual(['1.5'])
        const odd = renderRegister(mipsFpu, registers, 1, 'double')
        expect(odd.blank).toBe(true)
        expect(odd.chunks).toEqual([])
    })

    it('diffs a pair against the pair it was', () => {
        const registers = [
            { name: '$f0', value: 0n, prev: 0n },
            { name: '$f1', value: 0x3ff80000n, prev: 0x40000000n }
        ]
        const rendered = renderRegister(mipsFpu, registers, 0, 'double')
        expect(rendered.chunks).toEqual([{ text: '1.5', prevText: '2' }])
    })

    it('masks a pair half that arrives wider than the register it names', () => {
        //a Core that sign extends a 32 bit read hands back a value with the high word set; the pair
        //is still the two low words, not something shifted past bit 63
        const registers = [value(0n), value(0xffffffff3ff80000n)]
        const rendered = renderRegister(mipsFpu, registers, 0, 'double')
        expect(rendered.chunks.map((c) => c.text)).toEqual(['1.5'])
    })

    it('masks the even half of a pair too', () => {
        //the low word is as capable of arriving wide as the high one, and its stray bits would land
        //in the high half of the double rather than be dropped
        const registers = [value(0xdeadbeef00000000n), value(0x3ff80000n)]
        const rendered = renderRegister(mipsFpu, registers, 0, 'double')
        expect(rendered.chunks.map((c) => c.text)).toEqual(['1.5'])
    })

    it('reads the two lanes of a 128 bit register, lane 0 first', () => {
        const bits = (0x4000000000000000n << 64n) | 0x3ff8000000000000n
        const rendered = renderRegister(sse, [value(bits)], 0, 'double')
        expect(rendered.chunks.map((c) => c.text)).toEqual(['1.5', '2'])
        expect(rendered.hover[0]).toBe('0x40000000000000003ff8000000000000')
    })
})

/**
 * The six files the design record lists, written out in full. The descriptors themselves stay with
 * the language adapters, which is where [ADR
 * 0021](../../../docs/adr/0021-register-files-from-core-exports.md) puts the naming of a Core's
 * flat arrays, so this is not the shared constant they import; it is here so that the shared model
 * is exercised against the real shapes and so that the order and the Formats are written down once
 * where they can be copied without being guessed. Two rules the adapters must keep: a file's
 * registers are in the order the Core's flat array arrives in, which for the RISC-V FPU is
 * register-number order `f0..f31` and not alphabetical groups, and a file's first Format is its
 * default, which the design record's Default column decides.
 */
const designRecordFiles: RegisterFileDescriptor[] = [
    {
        id: 'fpu',
        label: 'FPU',
        size: RegisterSize.Long,
        formats: ['single', 'double', 'hex'],
        pairedDoubles: true,
        flagNames: ['0', '1', '2', '3', '4', '5', '6', '7'],
        registers: Array.from({ length: 32 }, (_, i) => ({ name: `$f${i}` }))
    },
    {
        id: 'cp0',
        label: 'CP0',
        size: RegisterSize.Long,
        formats: ['hex'],
        registers: [
            { name: '$8 (vaddr)' },
            { name: '$12 (status)' },
            { name: '$13 (cause)' },
            { name: '$14 (epc)' }
        ]
    },
    {
        id: 'fpu',
        label: 'FPU',
        size: RegisterSize.Double,
        formats: ['double', 'single', 'hex'],
        nanBoxedSingles: true,
        registers: [
            ...Array.from({ length: 8 }, (_, i) => ({ name: `ft${i}` })),
            { name: 'fs0' },
            { name: 'fs1' },
            ...Array.from({ length: 8 }, (_, i) => ({ name: `fa${i}` })),
            ...Array.from({ length: 10 }, (_, i) => ({ name: `fs${i + 2}` })),
            ...Array.from({ length: 4 }, (_, i) => ({ name: `ft${i + 8}` }))
        ]
    },
    {
        //Long here is the 32 bit target's word size; RISC-V-64 declares the same file at Double
        id: 'csr',
        label: 'CSR',
        size: RegisterSize.Long,
        formats: ['hex'],
        registers: [
            { name: 'ustatus' },
            { name: 'fflags' },
            { name: 'frm' },
            { name: 'fcsr' },
            { name: 'uie' },
            { name: 'utvec' },
            { name: 'uscratch' },
            { name: 'uepc' },
            { name: 'ucause' },
            { name: 'utval' },
            { name: 'uip' },
            { name: 'cycle' },
            { name: 'time' },
            { name: 'instret' },
            { name: 'cycleh' },
            { name: 'timeh' },
            { name: 'instreth' }
        ]
    },
    {
        id: 'sse',
        label: 'SSE',
        size: RegisterSize.Quad,
        formats: ['double', 'single', 'hex'],
        registers: [
            ...Array.from({ length: 16 }, (_, i) => ({ name: `xmm${i}` })),
            { name: 'mxcsr', size: RegisterSize.Long, kind: 'integer' as const }
        ]
    },
    {
        id: 'x87',
        label: 'x87',
        size: RegisterSize.Double,
        formats: ['double', 'hex'],
        registers: [
            ...Array.from({ length: 8 }, (_, i) => ({ name: `st${i}` })),
            { name: 'fctrl', size: RegisterSize.Word, kind: 'integer' as const },
            { name: 'fstat', size: RegisterSize.Word, kind: 'integer' as const },
            { name: 'ftag', size: RegisterSize.Word, kind: 'integer' as const }
        ]
    }
]

const x87 = rendering({
    size: RegisterSize.Double,
    formats: ['double', 'hex'],
    registers: [
        { name: 'st0' },
        { name: 'st1' },
        { name: 'ftag', size: RegisterSize.Word, kind: 'integer' }
    ]
})

describe('blanked rows', () => {
    //an x87 stack slot the tag word marks empty holds whatever it last held, commonly a NaN, so no
    //Format may read it as a number: gdb prints Empty and the panel draws the dash
    const empty = { ...x87, blanks: [false, true, false] }

    it('draws the dash and hovers the bits still underneath it', () => {
        const registers = [value(0x3ff8000000000000n), value(0x7ff8000000000000n), value(0x37fn)]
        const rendered = renderRegister(empty, registers, 1, 'double')
        expect(rendered.blank).toBe(true)
        expect(rendered.chunks).toEqual([{ text: '-', prevText: '-' }])
        expect(rendered.hover).toEqual(['0x7ff8000000000000'])
        //the slot beside it is read as it always was
        expect(renderRegister(empty, registers, 0, 'double').chunks.map((c) => c.text)).toEqual([
            '1.5'
        ])
    })

    it('blanks whichever Format the tab is showing, integer registers included', () => {
        const registers = [value(0n), value(0x7ff8000000000000n), value(0x37fn)]
        for (const format of ['double', 'hex'] as const) {
            expect(renderRegister(empty, registers, 1, format).chunks).toEqual([
                { text: '-', prevText: '-' }
            ])
        }
        const control = { ...x87, blanks: [false, false, true] }
        const rendered = renderRegister(control, registers, 2, 'double')
        expect(rendered.blank).toBe(true)
        expect(rendered.hover).toEqual(['0x037f'])
    })

    it('leaves a file that never blanks exactly as it was', () => {
        const registers = [value(0x3ff8000000000000n), value(0n), value(0n)]
        expect(renderRegister({ ...x87, blanks: [] }, registers, 0, 'double').blank).toBe(false)
        expect(renderRegister(x87, registers, 0, 'double').blank).toBe(false)
    })

    it('keeps the odd rows of a paired-doubles file blank in their own way', () => {
        //MARS's empty odd row carries no chunk at all, which is what tells the panel to draw the
        //dash without a hover: there is nothing under it but the other half of the pair above
        const registers = [value(0x00000000n), value(0x3ff80000n)]
        const odd = renderRegister({ ...mipsFpu, blanks: [] }, registers, 1, 'double')
        expect(odd.blank).toBe(true)
        expect(odd.chunks).toEqual([])
        expect(odd.hover).toEqual([])
    })
})

describe('the width of a file', () => {
    const cpu = { size: RegisterSize.Long, layout: [{ name: '$zero' }, { name: '$at' }] }

    it('grows with the longest name it shows and with the register width', () => {
        const long = { size: RegisterSize.Long, layout: [{ name: '$12 (status)' }] }
        expect(registerFileWidth(long, RegisterSize.Word)).toBeGreaterThan(
            registerFileWidth(cpu, RegisterSize.Word)
        )
        const wide = { size: RegisterSize.Double, layout: [{ name: '$at' }] }
        expect(registerFileWidth(wide, RegisterSize.Word)).toBeGreaterThan(
            registerFileWidth(cpu, RegisterSize.Word)
        )
    })

    it('ignores a name the file hides, because no row ever draws it', () => {
        const hiding = { ...cpu, hiddenRegisters: ['$zero'] }
        expect(registerFileWidth(hiding, RegisterSize.Word)).toBeLessThan(
            registerFileWidth(cpu, RegisterSize.Word)
        )
    })

    it('narrows as the grouping widens, because there are fewer groups to pad', () => {
        expect(registerFileWidth(cpu, RegisterSize.Long)).toBeLessThan(
            registerFileWidth(cpu, RegisterSize.Word)
        )
        //a grouping wider than the register is the register itself, as the renderer clamps it
        expect(registerFileWidth(cpu, RegisterSize.Quad)).toBe(
            registerFileWidth(cpu, RegisterSize.Long)
        )
    })

    it('shrinks the text but not the paddings when the rows are drawn compact', () => {
        const full = registerFileWidth(cpu, RegisterSize.Word)
        const compact = registerFileWidth(cpu, RegisterSize.Word, COMPACT_SCALE)
        expect(compact).toBeLessThan(full)
        expect(compact).toBeGreaterThan(full * COMPACT_SCALE)
    })

    it('never asks for less than the minimum width of a name', () => {
        const short = { size: RegisterSize.Long, layout: [{ name: 'a' }] }
        const nothing = { size: RegisterSize.Long, layout: [] }
        expect(registerFileWidth(short, RegisterSize.Word)).toBe(
            registerFileWidth(nothing, RegisterSize.Word)
        )
    })
})

describe('the width of the register column', () => {
    const cpu = { size: RegisterSize.Long, layout: [{ name: '$at' }] }
    const cp0 = { size: RegisterSize.Long, layout: [{ name: '$12 (status)' }] }

    it('is the CPU file plus the scrollbar, whatever the other files ask for', () => {
        const width = registerColumnWidth([cpu, cp0], RegisterSize.Word)
        expect(width).toBe(registerColumnWidth([cpu, cpu], RegisterSize.Word))
        expect(Number.parseFloat(width)).toBeGreaterThan(registerFileWidth(cpu, RegisterSize.Word))
        expect(width.endsWith('rem')).toBe(true)
    })

    it('is empty for a language with a single file, which has no tab to pick', () => {
        expect(registerColumnWidth([cpu], RegisterSize.Word)).toBe('')
        expect(registerColumnWidth([], RegisterSize.Word)).toBe('')
    })
})

describe('the files the adapters declare', () => {
    it('carries every descriptor of the design record', () => {
        const [mipsFpuLayout, cp0, riscvFpu, csr, sse, x87] =
            designRecordFiles.map(resolveRegisterFileLayout)
        //the defaults the layout fills in: the file's size, and float unless the register says not
        expect(mipsFpuLayout).toHaveLength(32)
        expect(mipsFpuLayout[0]).toEqual({ name: '$f0', size: RegisterSize.Long, kind: 'float' })
        expect(cp0[0]).toEqual({ name: '$8 (vaddr)', size: RegisterSize.Long, kind: 'integer' })
        //register-number order, so the name at index n is the Core's f<n>
        expect(riscvFpu).toHaveLength(32)
        expect(riscvFpu.map((register) => register.name).slice(0, 12)).toEqual([
            'ft0',
            'ft1',
            'ft2',
            'ft3',
            'ft4',
            'ft5',
            'ft6',
            'ft7',
            'fs0',
            'fs1',
            'fa0',
            'fa1'
        ])
        expect(riscvFpu[18].name).toBe('fs2')
        expect(riscvFpu[31].name).toBe('ft11')
        expect(csr).toHaveLength(17)
        expect(sse).toHaveLength(17)
        expect(sse[16]).toEqual({ name: 'mxcsr', size: RegisterSize.Long, kind: 'integer' })
        expect(x87[8]).toEqual({ name: 'fctrl', size: RegisterSize.Word, kind: 'integer' })
    })

    it('makes the default Format the first one, as the design record decides it', () => {
        expect(designRecordFiles.map((file) => file.formats[0])).toEqual([
            'single',
            'hex',
            'double',
            'hex',
            'double',
            'double'
        ])
    })
})

/**
 * Committing a chunk back: the Poke a typed chunk asks for
 * ([the design record](../../../docs/design/pokes.md)). The rendering rules above have to hold in
 * reverse, so these read the same files: a group replaces its own digits, a lane its own bits, a
 * MIPS double its pair and a RISC-V single its boxing.
 */

const cpu = rendering({
    size: RegisterSize.Long,
    formats: ['hex'],
    registers: [{ name: 'd0' }, { name: 'd1' }]
})

/** The file's registers holding those bits, named as the file names them. */
function holding(file: RegisterFileRendering, ...bits: bigint[]): RenderableRegister[] {
    return bits.map((value, index) => ({
        name: file.layout[index]?.name ?? `r${index}`,
        value,
        prev: value
    }))
}

function poke(
    file: RegisterFileRendering,
    registers: readonly RenderableRegister[],
    index: number,
    format: RegisterFormat,
    chunkIndex: number,
    text: string,
    options: { groupSize?: RegisterSize; decimals?: boolean } = {}
) {
    return parseRegisterPoke({
        file,
        registers,
        index,
        format,
        groupSize: options.groupSize ?? RegisterSize.Long,
        chunkIndex,
        text,
        decimals: options.decimals ?? false
    })
}

describe('poking a hex group', () => {
    const registers = holding(cpu, 0x11223344n, 0n)
    const byWord = { groupSize: RegisterSize.Word }

    it('replaces only the digits of the group that was typed into', () => {
        expect(poke(cpu, registers, 0, 'hex', 0, 'ffff', byWord)).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0xffff3344n }]
        })
        expect(poke(cpu, registers, 0, 'hex', 1, 'ffff', byWord)).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0x1122ffffn }]
        })
    })

    it('takes the whole register when the grouping is the register', () => {
        expect(poke(cpu, registers, 0, 'hex', 0, '0xdeadbeef')).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0xdeadbeefn }]
        })
    })

    it('trims the text and zero fills the digits the commit left out', () => {
        expect(poke(cpu, registers, 0, 'hex', 0, '  7f  ', byWord)).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0x007f3344n }]
        })
    })

    it('refuses a value wider than the group rather than truncating it', () => {
        const refused = poke(cpu, registers, 0, 'hex', 0, '1ffff', byWord)
        expect(refused.ok).toBe(false)
        expect(refused.ok === false && refused.reason).toContain('16 bits')
    })

    it('refuses text that is not a number, and an empty commit', () => {
        expect(poke(cpu, registers, 0, 'hex', 0, 'zz').ok).toBe(false)
        expect(poke(cpu, registers, 0, 'hex', 0, '   ').ok).toBe(false)
    })

    it('reads a bare number as a decimal when the Preference draws decimals', () => {
        expect(poke(cpu, registers, 0, 'hex', 1, '16', { ...byWord, decimals: true })).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0x11220010n }]
        })
        //signed, as the group's hover reads it
        expect(poke(cpu, registers, 0, 'hex', 1, '-2', { ...byWord, decimals: true })).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0x1122fffen }]
        })
        expect(poke(cpu, registers, 0, 'hex', 1, '-40000', { ...byWord, decimals: true }).ok).toBe(
            false
        )
        expect(poke(cpu, registers, 0, 'hex', 1, '70000', { ...byWord, decimals: true }).ok).toBe(
            false
        )
    })

    it('still reads an explicit 0x as hex while decimals are drawn', () => {
        expect(poke(cpu, registers, 0, 'hex', 1, '0x1f', { ...byWord, decimals: true })).toEqual({
            ok: true,
            writes: [{ register: 'd0', value: 0x1122001fn }]
        })
        //a bare hex digit is not a decimal, so it is refused rather than read as something else
        expect(poke(cpu, registers, 0, 'hex', 1, '1f', { ...byWord, decimals: true }).ok).toBe(
            false
        )
    })

    it('keeps an integer register inside a float file hexadecimal, whatever the Format', () => {
        expect(poke(x87, holding(x87, 0n, 0n, 0x37fn), 2, 'double', 0, '0x1f')).toEqual({
            ok: true,
            writes: [{ register: 'ftag', value: 0x001fn }]
        })
    })
})

describe('poking a float lane', () => {
    it('encodes a single at the precision of its lane', () => {
        expect(poke(mipsFpu, holding(mipsFpu, 0n, 0n), 0, 'single', 0, '3')).toEqual({
            ok: true,
            writes: [{ register: '$f0', value: 0x40400000n }]
        })
        expect(decodeSingle(encodeSingle(0.1))).toBe(Math.fround(0.1))
        expect(decodeDouble(encodeDouble(0.1))).toBe(0.1)
    })

    it('takes NaN and the infinities, in any case', () => {
        const nan = poke(mipsFpu, holding(mipsFpu, 0n, 0n), 0, 'single', 0, 'nan')
        expect(nan.ok === true && Number.isNaN(decodeSingle(nan.writes[0].value))).toBe(true)
        const negative = poke(mipsFpu, holding(mipsFpu, 0n, 0n), 0, 'single', 0, '-Infinity')
        expect(negative.ok === true && decodeSingle(negative.writes[0].value)).toBe(-Infinity)
    })

    it('refuses text that is not a number', () => {
        expect(poke(mipsFpu, holding(mipsFpu, 0n, 0n), 0, 'single', 0, '0x10').ok).toBe(false)
        expect(poke(mipsFpu, holding(mipsFpu, 0n, 0n), 0, 'single', 0, 'three').ok).toBe(false)
    })

    it('writes a MIPS double to its pair, low word in the even register', () => {
        expect(poke(mipsFpu, holding(mipsFpu, 0n, 0n), 0, 'double', 0, '1.5')).toEqual({
            ok: true,
            writes: [
                { register: '$f0', value: 0x00000000n },
                { register: '$f1', value: 0x3ff80000n }
            ]
        })
    })

    it('refuses the odd row of a pair, which draws no value to type into', () => {
        expect(poke(mipsFpu, holding(mipsFpu, 0n, 0n), 1, 'double', 0, '1.5').ok).toBe(false)
    })

    it('NaN-boxes a RISC-V single, which is what the Core reads back as one', () => {
        expect(poke(riscvFpu, holding(riscvFpu, 0n), 0, 'single', 0, '3')).toEqual({
            ok: true,
            writes: [{ register: 'ft0', value: 0xffffffff40400000n }]
        })
    })

    it('replaces one lane of a wide register and leaves the others alone', () => {
        const registers = holding(sse, (0x4000000000000000n << 64n) | 0x3ff8000000000000n)
        expect(poke(sse, registers, 0, 'double', 0, '3')).toEqual({
            ok: true,
            writes: [
                { register: 'xmm0', value: (0x4000000000000000n << 64n) | 0x4008000000000000n }
            ]
        })
        expect(poke(sse, registers, 0, 'double', 1, '3')).toEqual({
            ok: true,
            writes: [
                { register: 'xmm0', value: (0x4008000000000000n << 64n) | 0x3ff8000000000000n }
            ]
        })
    })

    it('refuses a blanked row, which holds nothing to change', () => {
        const empty = { ...x87, blanks: [false, true, false] }
        expect(poke(empty, holding(x87, 0n, 0n, 0n), 1, 'double', 0, '1.5').ok).toBe(false)
    })
})
