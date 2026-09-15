import {
    defaultRegisterKind,
    type RegisterFileRegister,
    type RegisterFormat,
    RegisterSize,
    toHexString
} from '$lib/languages/commonLanguageFeatures.svelte'
import { unsignedBigIntToSigned } from '$lib/utils'

/**
 * Rendering a Register file's values in the Format the panel is showing
 * ([the design record](../../../docs/design/register-files.md)). Plain TypeScript on purpose: this
 * is where the IEEE 754 decoding, the MIPS pairing rule and the RISC-V NaN-boxing rule live, and
 * every one of them is worth testing without a component around it.
 */

const WORD_MASK = 0xffffffffn
const DOUBLE_MASK = 0xffffffffffffffffn

/** What a blanked row draws in place of a value, which MARS and gdb both leave as a dash. */
const BLANK_TEXT = '-'

//one buffer for the whole module: decoding a register is a read, and the panel does it for every
//register of every visible row on every refresh
const scratch = new DataView(new ArrayBuffer(8))

/** The low 32 bits of `bits` read as an IEEE 754 single. */
export function decodeSingle(bits: bigint): number {
    scratch.setUint32(0, Number(bits & WORD_MASK))
    return scratch.getFloat32(0)
}

/** The low 64 bits of `bits` read as an IEEE 754 double. */
export function decodeDouble(bits: bigint): number {
    scratch.setBigUint64(0, bits & DOUBLE_MASK)
    return scratch.getFloat64(0)
}

/**
 * Whether a 64 bit value is a NaN-boxed single: bits 32..63 all ones. RISC-V stores a single that
 * way, and a register that is not boxed holds something that is not a single, which RARS shows as
 * NaN rather than as the low word's bit pattern.
 */
export function isNanBoxed(bits: bigint): boolean {
    return ((bits >> 32n) & WORD_MASK) === WORD_MASK
}

/**
 * The shortest decimal that reads back as the same single. `String(value)` prints the double the
 * single widened to, so `0.1f` would read as 0.10000000149011612; nine significant digits always
 * round-trip a single, so the first precision that survives `Math.fround` is the one to show.
 */
export function formatFloat32(value: number): string {
    if (Number.isNaN(value)) return 'NaN'
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity'
    if (value === 0) return Object.is(value, -0) ? '-0' : '0'
    for (let precision = 1; precision <= 9; precision++) {
        const candidate = Number.parseFloat(value.toPrecision(precision))
        if (Math.fround(candidate) === value) return String(candidate)
    }
    return String(value)
}

/** The same for a double, where `String` already prints the shortest round-tripping decimal. */
export function formatFloat64(value: number): string {
    if (Object.is(value, -0)) return '-0'
    return String(value)
}

/**
 * The reading behind one hex group, which a float lane has no equivalent of. The CPU panel hovers
 * a group's decimals rather than the whole register's, and swaps the hex for the decimal when the
 * hex/decimal Preference is off, so a panel that renders through here needs the group's numbers
 * and not only its text.
 */
export type RenderedRegisterGroup = {
    /** The group's width in bytes: the file's grouping, never wider than the register itself. */
    bytes: number
    value: bigint
    valueSigned: bigint
    /** The same group of the previous value, for the decimal rendering of a diff. */
    prevValue: bigint
}

export type RenderedRegisterChunk = {
    text: string
    /** The same chunk of the previous value, which is what change highlighting diffs against. */
    prevText: string
    /** Present on a hex chunk only; see `RenderedRegisterGroup`. */
    group?: RenderedRegisterGroup
}

export type RenderedRegister = {
    chunks: RenderedRegisterChunk[]
    /**
     * The whole register's other readings, one line each: the raw hex and the precisions the row is
     * not showing, or for an integer kind its signed and unsigned decimal. The per-group hover the
     * CPU panel shows is built from each chunk's `group` instead.
     */
    hover: string[]
    /**
     * True for a row that shows nothing: the odd row of a `pairedDoubles` file, which carries no
     * chunks at all, or a register the file blanked, which carries the dash to draw and hovers the
     * bits still underneath it.
     */
    blank: boolean
}

/** What `renderRegister` needs of a Register file; a `RegisterFile` satisfies it as it is. */
export type RegisterFileRendering = {
    size: RegisterSize
    formats: readonly RegisterFormat[]
    pairedDoubles?: boolean
    nanBoxedSingles?: boolean
    layout: readonly RegisterFileRegister[]
    /**
     * One entry per register, true for a row that holds no value at this refresh. A file that never
     * blanks leaves it empty, which is every file but x86's x87 stack.
     */
    blanks?: readonly boolean[]
}

/** What it needs of a register: a `Register` satisfies it, and so does a plain bit pattern. */
export type RenderableRegister = {
    name: string
    value: bigint
    prev: bigint
    /** A `Register` knows the width it was given, which wins over the file's layout (Z80's `a`). */
    size?: bigint | number
}

function sizeOf(file: RegisterFileRendering, register: RenderableRegister, index: number): number {
    if (register.size !== undefined) return Number(register.size)
    return Number(file.layout[index]?.size ?? file.size)
}

function kindOf(file: RegisterFileRendering, index: number): 'integer' | 'float' {
    return file.layout[index]?.kind ?? defaultRegisterKind(file.formats)
}

/**
 * The hex grouping of one register, which is `Register.toSizedGroups` in
 * commonLanguageFeatures.svelte.ts for a plain bit pattern rather than for a `$state` Register. The
 * two have to agree, because the CPU panel and a Register file panel sit next to each other: a
 * group is never wider than the register it was cut from, and its signed reading is taken over that
 * clamped width.
 */
function hexChunks(
    value: bigint,
    prev: bigint,
    size: number,
    groupSize: number
): RenderedRegisterChunk[] {
    const group = Math.max(1, Math.min(groupSize, size))
    const hex = toHexString(value, size)
    const prevHex = toHexString(prev, size)
    const digits = group * 2
    const chunks: RenderedRegisterChunk[] = []
    for (let i = 0; i < hex.length; i += digits) {
        const text = hex.slice(i, i + digits)
        const prevText = prevHex.slice(i, i + digits)
        const groupValue = BigInt(`0x${text}`)
        chunks.push({
            text,
            prevText,
            group: {
                bytes: group,
                value: groupValue,
                valueSigned: unsignedBigIntToSigned(groupValue, group),
                prevValue: BigInt(`0x${prevText}`)
            }
        })
    }
    return chunks
}

/**
 * The lanes a float Format reads out of one register, low lane first: a 128 bit SSE register holds
 * four singles or two doubles, and everything narrower holds one value, including a 64 bit register
 * read as a single, where the single is the low word and the high word is the boxing (or garbage).
 */
function lanes(bits: bigint, size: number, laneBytes: number): bigint[] {
    const count = size > RegisterSize.Double ? Math.floor(size / laneBytes) : 1
    if (count <= 1) return [bits]
    const width = BigInt(laneBytes * 8)
    const mask = (1n << width) - 1n
    const result: bigint[] = []
    for (let i = 0; i < count; i++) result.push((bits >> (width * BigInt(i))) & mask)
    return result
}

function singleText(file: RegisterFileRendering, bits: bigint, size: number): string[] {
    return lanes(bits, size, 4).map((lane, index) => {
        //the boxing rule reads the whole 64 bit register, so it only applies to the one lane a
        //RISC-V register has, never to an SSE lane that was cut out of a wider value
        if (file.nanBoxedSingles && size === RegisterSize.Double && index === 0) {
            return isNanBoxed(bits) ? formatFloat32(decodeSingle(bits)) : 'NaN'
        }
        return formatFloat32(decodeSingle(lane))
    })
}

function doubleText(
    file: RegisterFileRendering,
    registers: readonly RenderableRegister[],
    index: number,
    size: number,
    read: (register: RenderableRegister) => bigint
): string[] | null {
    if (file.pairedDoubles && size === RegisterSize.Long) {
        //MARS's Double column: the pair is read on the even register, low word in it, and the odd
        //row shows nothing rather than half of a value
        if (index % 2 === 1) return null
        const high = registers[index + 1]
        //both halves are masked to their declared word: a Core that hands back a value wider than
        //the register it names (a sign extended `Int32Array` read is the usual way) would otherwise
        //push bits past 63 and read back as a quietly wrong double instead of the low pair
        const bits =
            (((high ? read(high) : 0n) & WORD_MASK) << 32n) | (read(registers[index]) & WORD_MASK)
        return [formatFloat64(decodeDouble(bits))]
    }
    return lanes(read(registers[index]), size, 8).map((lane) => formatFloat64(decodeDouble(lane)))
}

/**
 * One row of a Register file panel: the chunks to draw, each with the text the previous value drew
 * so the renderer can highlight what changed, and the hover lines.
 *
 * `format` is the Format the file's tab is showing and `groupSize` the B/W/L/D/Q grouping of the
 * hex one, never wider than the register itself. A register of integer kind ignores the Format and
 * stays hexadecimal, which is how a control register inside a floating-point file (`mxcsr`,
 * `fctrl`) has always been read.
 *
 * `registers` must be the file's whole array in the descriptor's order, and `index` an index into
 * it, because both the `pairedDoubles` rule and the per-register size and kind are looked up by
 * position: the pair of an even register is its neighbour in that array, and the layout entry of a
 * row is the layout entry at the same index. A panel that hides registers therefore filters after
 * rendering, never before, or a file that ever combines `hiddenRegisters` with a pairing rule or a
 * per-register override would silently read the wrong neighbour.
 */
export function renderRegister(
    file: RegisterFileRendering,
    registers: readonly RenderableRegister[],
    index: number,
    format: RegisterFormat,
    groupSize: RegisterSize = RegisterSize.Long
): RenderedRegister {
    const register = registers[index]
    if (!register) return { chunks: [], hover: [], blank: true }
    const size = sizeOf(file, register, index)
    const kind = kindOf(file, index)
    const effective: RegisterFormat = kind === 'integer' ? 'hex' : format

    //a blanked register holds whatever it last held, so no Format may read it as a number: the row
    //is the dash gdb prints as Empty and the stale bits stay a hover away, as the design record asks
    if (file.blanks?.[index]) {
        return {
            chunks: [{ text: BLANK_TEXT, prevText: BLANK_TEXT }],
            hover: [`0x${toHexString(register.value, size)}`],
            blank: true
        }
    }

    const texts = (
        form: RegisterFormat,
        read: (r: RenderableRegister) => bigint
    ): string[] | null => {
        if (form === 'single') return singleText(file, read(register), size)
        return doubleText(file, registers, index, size, read)
    }

    if (effective === 'hex') {
        const hover: string[] = []
        if (kind === 'integer') {
            const signed = unsignedBigIntToSigned(register.value, size)
            if (signed !== register.value) hover.push(String(signed))
            hover.push(String(register.value))
        } else {
            for (const other of file.formats) {
                if (other === 'hex') continue
                const text = texts(other, (r) => r.value)
                if (text) hover.push(`${other} ${text.join(', ')}`)
            }
        }
        return {
            chunks: hexChunks(register.value, register.prev, size, groupSize),
            hover,
            blank: false
        }
    }

    const current = texts(effective, (r) => r.value)
    if (!current) return { chunks: [], hover: [], blank: true }
    const previous = texts(effective, (r) => r.prev) ?? current
    const hover: string[] = [`0x${toHexString(register.value, size)}`]
    for (const other of file.formats) {
        if (other === 'hex' || other === effective) continue
        const text = texts(other, (r) => r.value)
        if (text) hover.push(`${other} ${text.join(', ')}`)
    }
    return {
        chunks: current.map((text, lane) => ({ text, prevText: previous[lane] ?? text })),
        hover,
        blank: false
    }
}

/**
 * What the width estimate needs of a Register file: the width of the registers it draws and the
 * names it puts beside them. A `RegisterFile` satisfies it as it is.
 */
export type RegisterFileMeasure = {
    size: RegisterSize
    layout: readonly RegisterFileRegister[]
    hiddenRegisters?: readonly string[]
}

//the lengths RegisterFileRows.svelte lays a row out with, in rem, so that the two agree: the row
//padding of the grid, the gap between its two columns, the padding and the minimum width of a name,
//the padding and border the value column leads with, and the padding and gap of one hex group
const ROW_PADDING = 1.4
const ROW_GAP = 0.22
const NAME_PADDING = 0.4
const NAME_MIN_WIDTH = 1.6
const VALUE_LEAD = 0.3
const GROUP_PADDING = 0.2
const GROUP_GAP = 0.1

//the two lengths no stylesheet knows, because they are the font's: both are upper bounds rather
//than measurements. No monospace digit at 1rem is wider than 0.62rem, and a name is drawn at 0.9em,
//where no bold upper-case character is wider than 0.65rem, so a column sized from them is a few
//pixels wider than the rows it holds, which is the safe way to be wrong: too narrow would push a
//row out of the column, too wide only spreads the groups a little
const DIGIT_WIDTH = 0.62
const NAME_CHARACTER_WIDTH = 0.65

/** The `.compact` rows of the panel are drawn at four fifths of the size. */
export const COMPACT_SCALE = 0.8

//the room the panel keeps for its scrollbar, which `scrollbar-gutter: stable` reserves whether the
//visible file scrolls or not. A scrollbar is the browser's own width and no stylesheet can ask for
//it, so this is the widest one worth expecting; where the scrollbar is an overlay it is slack
const SCROLLBAR_ALLOWANCE = 1

//the narrowest the column is allowed to be once it has tabs. The CPU file of MIPS and RISC-V asks
//for less than this, and at that width the tab strip is the widest thing in the panel: the tabs
//end up tighter than the rows they name, and every other file is drawn compact for no reason
const TABBED_COLUMN_MIN_WIDTH = 13

/**
 * The width one Register file's rows ask the register column for, in rem, read as hexadecimal,
 * which is the widest an integer file ever gets and the one reading every file offers.
 *
 * The project page pins the register column to one width so that picking a tab never slides the
 * memory panel beside it, and this is where that width comes from. A file that asks for more than
 * the column has is drawn compact, which is the treatment a floating-point file gets anyway.
 *
 * `scale` is what the row's text is multiplied by: the paddings are in rem and do not shrink with
 * the font, so a compact file is not simply four fifths of a full-sized one.
 */
export function registerFileWidth(
    file: RegisterFileMeasure,
    groupSize: RegisterSize,
    scale = 1
): number {
    const size = Number(file.size)
    const group = Math.max(1, Math.min(Number(groupSize), size))
    const groups = Math.max(1, Math.ceil(size / group))
    const hidden = file.hiddenRegisters ?? []
    const characters = file.layout.reduce(
        (longest, register) =>
            hidden.includes(register.name) ? longest : Math.max(longest, register.name.length),
        0
    )
    const name = Math.max(NAME_MIN_WIDTH, characters * NAME_CHARACTER_WIDTH * scale + NAME_PADDING)
    const value =
        VALUE_LEAD +
        2 * size * DIGIT_WIDTH * scale +
        groups * GROUP_PADDING +
        (groups - 1) * GROUP_GAP
    return ROW_PADDING + name + ROW_GAP + value
}

/**
 * The width the register column is pinned at: the CPU file's, which is the file that has always set
 * this page's layout, plus the room the panel keeps for its scrollbar, and never less than
 * `TABBED_COLUMN_MIN_WIDTH`. Empty for a language with a single file, which has no tab to pick and
 * so nothing that could move its column: M68K and Z80 go on sizing themselves exactly as they
 * always did.
 */
export function registerColumnWidth(
    files: readonly RegisterFileMeasure[],
    groupSize: RegisterSize
): string {
    if (files.length < 2) return ''
    const width = registerFileWidth(files[0], groupSize) + SCROLLBAR_ALLOWANCE
    return `${Math.max(width, TABBED_COLUMN_MIN_WIDTH).toFixed(2)}rem`
}
