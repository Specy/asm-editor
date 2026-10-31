/**
 * x86's **Display configuration**: the width and height of the framebuffer `/dev/fb0` reports, the
 * pinned guest's `video=` on its kernel command line
 * ([x86 devices](../../../../../../docs/design/x86-devices.md), "Screen size and format"; decision 13
 * of [the plan](../../../../../../docs/design/x86-devices-plan.md)). It is a width and a height only:
 * fbdev has no unit size, since scaling up is the Screen's zoom, which a program cannot see, and
 * `mmap` decides where the pixels live, so there is no base address either.
 *
 * The guest builds `video=` as a GTF mode, which rounds the width to the nearest multiple of 8, so
 * widths here are multiples of 8, as the menu's sizes and its Custom field's are. Stored in the
 * Program's `display` beside MARS's five fields (`marsDisplay.ts`), the user's choice unless the
 * Entry file's `@screen` comment names a size (`x86ScreenDirective.ts`).
 *
 * Plain TypeScript, no runes and no DOM.
 */

export type X86Display = { width: number; height: number }

/** The size the guest boots with, small enough that a learner's first animation runs smoothly. */
export const DEFAULT_X86_DISPLAY: Readonly<X86Display> = { width: 320, height: 240 }

/** GTF's character cell: every width is a multiple of it. */
export const X86_DISPLAY_WIDTH_STEP = 8
/**
 * The sizes the Display takes, in pixels. The smallest is the design's placeholder until the pinned
 * guest's boot gives the smallest `video=` it accepts.
 */
export const X86_DISPLAY_SIZE_MIN = 8
export const X86_DISPLAY_SIZE_MAX = 1024

/**
 * The Display menu's sizes, the classic ones a program or a tutorial asks for, every width already
 * a multiple of 8; any other size is the menu's Custom entry.
 */
export const X86_DISPLAY_SIZE_CHOICES: readonly Readonly<X86Display>[] = [
    { width: 160, height: 120 },
    { width: 256, height: 192 },
    { width: 320, height: 200 },
    { width: 320, height: 240 },
    { width: 400, height: 300 },
    { width: 512, height: 384 },
    { width: 640, height: 400 },
    { width: 640, height: 480 },
    { width: 800, height: 600 },
    { width: 1024, height: 768 }
]

/**
 * A width the Display takes, the nearest one to `value` as GTF rounds a width, within the range;
 * `fallback` for a non-number.
 */
export function snapX86DisplayWidth(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback
    const snapped = Math.round(value / X86_DISPLAY_WIDTH_STEP) * X86_DISPLAY_WIDTH_STEP
    return Math.min(X86_DISPLAY_SIZE_MAX, Math.max(X86_DISPLAY_SIZE_MIN, snapped))
}

/** A height the Display takes, the nearest whole number within the range; `fallback` for a non-number. */
export function snapX86DisplayHeight(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback
    return Math.min(X86_DISPLAY_SIZE_MAX, Math.max(X86_DISPLAY_SIZE_MIN, Math.round(value)))
}

/**
 * Brings a stored display into the sizes the Display takes. A hand-edited project file, a share
 * link from a later version or a MIPS display read on x86 all come out as a size the guest boots
 * with; only `width` and `height` are read.
 */
export function normalizeX86Display(display: Partial<X86Display> | undefined): X86Display {
    return {
        width: snapX86DisplayWidth(display?.width, DEFAULT_X86_DISPLAY.width),
        height: snapX86DisplayHeight(display?.height, DEFAULT_X86_DISPLAY.height)
    }
}

export function x86DisplayEquals(a: X86Display, b: X86Display): boolean {
    return a.width === b.width && a.height === b.height
}

/** How the menu and the hint write a size: `320 × 240`. */
export function formatX86Display(display: X86Display): string {
    return `${display.width} × ${display.height}`
}
