/**
 * The MARS and RARS bitmap display configuration: the five parameters of their `BitmapDisplay`
 * tool, with its own choice lists and defaults, so a program written against either simulator shows
 * the same picture here. MIPS and RISC-V share it because RARS's tool is a port of MARS's.
 *
 * The user picks these in the Screen panel's header and they are stored in the project's display
 * field, because every example states them in its header comment and a project has to reopen with
 * the same display.
 *
 * Plain TypeScript, no runes and no DOM: the geometry is used by the adapters, by the popover and
 * by the tests alike.
 *
 * Source: [BitmapDisplay.java](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/BitmapDisplay.java).
 */

/**
 * The five parameters. It is project data rather than a setting because every example states it in
 * its header comment and a project has to reopen with the same display; a Testcase run uses it too.
 * The M68K and the Z80 have no entry here: their programs configure their own Screen.
 */
export type ProjectDisplay = {
    /** The width in Screen pixels of one memory word, 1 to 32; also the GUI's actual-size zoom. */
    unitWidth: number
    unitHeight: number
    /** MARS's display area in pixels, 64 to 1024. The word grid is this divided by the unit size. */
    width: number
    height: number
    /** Where the word grid starts in Core memory. A number, not a bigint: MARS's own choices fit. */
    baseAddress: number
}

/** "Unit Width/Height in Pixels": how many screen pixels one memory word covered in MARS. */
export const MARS_UNIT_SIZE_CHOICES = [1, 2, 4, 8, 16, 32] as const

/** "Display Width/Height in Pixels": the size of MARS's own display area. */
export const MARS_DISPLAY_SIZE_CHOICES = [64, 128, 256, 512, 1024] as const

/**
 * "Base address for display". MARS builds this list from its `Memory` constants and defaults to
 * static data; the labels are its own.
 */
export const MARS_BASE_ADDRESS_CHOICES: readonly { address: number; label: string }[] = [
    { address: 0x10000000, label: 'global data' },
    { address: 0x10008000, label: '$gp' },
    { address: 0x10010000, label: 'static data' },
    { address: 0x10040000, label: 'heap' },
    { address: 0xffff0000, label: 'memory map' }
]

/** MARS's and RARS's own defaults: one word per pixel, 512 by 256, in static data. */
export const DEFAULT_PROJECT_DISPLAY: ProjectDisplay = {
    unitWidth: 1,
    unitHeight: 1,
    width: 512,
    height: 256,
    baseAddress: 0x10010000
}

/** Where the word grid lives in Core memory and how big it is. */
export type MarsDisplayGeometry = {
    /** Words per row, `width / unitWidth`, and one Screen pixel each. */
    columns: number
    rows: number
    /** `columns * rows`, already clamped so the grid cannot run past the top of memory. */
    words: number
    baseAddress: number
    /** The address of the last observed word, inclusive, which is what the Core's ranges want. */
    endAddress: number
}

/**
 * Snaps a stored display onto MARS's choice lists. `cleanDisplay` in `Project.svelte` already makes
 * the five fields finite integers; this is what keeps a hand-edited project file, or a share link
 * from a future version with longer lists, from producing a Screen no tool could have configured.
 */
export function normalizeMarsDisplay(display: ProjectDisplay | undefined): ProjectDisplay {
    const source = display ?? DEFAULT_PROJECT_DISPLAY
    return {
        unitWidth: nearestChoice(source.unitWidth, MARS_UNIT_SIZE_CHOICES),
        unitHeight: nearestChoice(source.unitHeight, MARS_UNIT_SIZE_CHOICES),
        width: nearestChoice(source.width, MARS_DISPLAY_SIZE_CHOICES),
        height: nearestChoice(source.height, MARS_DISPLAY_SIZE_CHOICES),
        baseAddress: nearestBaseAddress(source.baseAddress)
    }
}

/**
 * The grid a display describes. One word is one logical Screen pixel, as the design record decides,
 * so the Screen is `columns` by `rows` and the unit size only survives as the GUI zoom.
 */
export function marsDisplayGeometry(display: ProjectDisplay): MarsDisplayGeometry {
    const normalized = normalizeMarsDisplay(display)
    const columns = Math.max(1, Math.floor(normalized.width / normalized.unitWidth))
    const rows = Math.max(1, Math.floor(normalized.height / normalized.unitHeight))
    const baseAddress = normalized.baseAddress >>> 0
    //the memory map base plus a megapixel grid would wrap past 0xffffffff, and a Core range that
    //wraps is rejected, so the grid stops at the top of the address space instead
    const fits = Math.floor((0x100000000 - baseAddress) / 4)
    const words = Math.max(1, Math.min(columns * rows, fits))
    return {
        columns,
        rows,
        words,
        baseAddress,
        endAddress: (baseAddress + (words - 1) * 4) >>> 0
    }
}

/** The address of one word of the grid, unsigned. */
export function marsWordAddress(baseAddress: number, index: number): number {
    return ((baseAddress >>> 0) + index * 4) >>> 0
}

/** How MARS itself labels a base address in its combo box, e.g. `0x10010000 (static data)`. */
export function formatMarsBaseAddress(address: number): string {
    const hex = `0x${(address >>> 0).toString(16).padStart(8, '0')}`
    const choice = MARS_BASE_ADDRESS_CHOICES.find((entry) => entry.address >>> 0 === address >>> 0)
    return choice ? `${hex} (${choice.label})` : hex
}

function nearestChoice(value: number, choices: readonly number[]): number {
    let best = choices[0] ?? 1
    let bestDistance = Number.POSITIVE_INFINITY
    for (const choice of choices) {
        const distance = Math.abs(choice - value)
        if (distance < bestDistance) {
            best = choice
            bestDistance = distance
        }
    }
    return best
}

function nearestBaseAddress(value: number): number {
    const wanted = value >>> 0
    const match = MARS_BASE_ADDRESS_CHOICES.find((entry) => entry.address >>> 0 === wanted)
    if (match) return match.address
    return DEFAULT_PROJECT_DISPLAY.baseAddress
}
