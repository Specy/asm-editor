import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { Keyboard } from './Keyboard'
import { Mouse } from './Mouse'
import { ProgramClock } from './ProgramClock'
import { RandomSource } from './RandomSource'
import { SCREEN_CELL_8X16, SCREEN_CELL_8X8, type ScreenCellSize } from './screen/bitmapFont'
import { Screen, type ScreenOptions } from './screen/Screen'
import type { Terminal } from './Terminal.svelte'
import { FileSystem } from './FileSystem'
import { Audio } from './audio/Audio'
import { X86Input } from './x86Input'

/**
 * The peripherals an Emulator owns besides its Terminal, injected at the Emulator boundary so the
 * GUI observes the very instances the Core draws on and reads from
 * ([ADR 0004](../../../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)). The Terminal is
 * not injectable: it needs the Emulator's own `ExecutionController`, so the Emulator builds it and
 * adds it to the set.
 *
 * Plain TypeScript, no runes: the whole set has to be constructible under node, where the tests and
 * the adapter probes run.
 */

export type InjectedPeripherals = {
    screen: Screen
    keyboard: Keyboard
    mouse: Mouse
    clock: ProgramClock
    /** Where the random services start from: host randomness, or the fixed seed of a Testcase. */
    random: RandomSource
    fileSystem: FileSystem
    /** The Notes and Sounds a program plays; silent until the GUI hands it the browser's output. */
    audio: Audio
    /**
     * The Screen's keys and pointer as x86's Linux input devices receive them, which the Screen
     * widget feeds on x86 in place of the Keyboard and Mouse. Every language has one so that every
     * Emulator has the same shape; it reports nothing until an adapter gives it a sink.
     */
    x86Input: X86Input
}

/** What a caller may hand an Emulator; anything it leaves out is built from the language defaults. */
export type InjectedPeripheralOptions = Partial<InjectedPeripherals>

export type EmulatorPeripherals = InjectedPeripherals & { terminal: Terminal }

/**
 * The Screen a language starts with, from the display table of the design record: EASy68K's minimum
 * window for the M68K, the Z80's default resolution, MARS's bitmap display defaults for MIPS and
 * RISC-V, and the default Display configuration of x86's framebuffer, `/dev/fb0`
 * ([x86 devices](../../../../../../docs/design/x86-devices.md), "Screen size and format"). The program
 * (M68K, Z80) or the user (MIPS, RISC-V, x86) changes it from there.
 */
type ScreenDefaults = { width: number; height: number; cell: ScreenCellSize }

const SCREEN_DEFAULTS: Record<AvailableLanguages, ScreenDefaults> = {
    M68K: { width: 640, height: 480, cell: SCREEN_CELL_8X16 },
    Z80: { width: 256, height: 192, cell: SCREEN_CELL_8X8 },
    MIPS: { width: 512, height: 256, cell: SCREEN_CELL_8X16 },
    'RISC-V': { width: 512, height: 256, cell: SCREEN_CELL_8X16 },
    'RISC-V-64': { width: 512, height: 256, cell: SCREEN_CELL_8X16 },
    X86: { width: 320, height: 240, cell: SCREEN_CELL_8X16 }
}

export function defaultScreenOptions(language: AvailableLanguages): ScreenOptions {
    return { ...(SCREEN_DEFAULTS[language] ?? SCREEN_DEFAULTS.M68K) }
}

/**
 * Whether the Screen panel is shown for a language: for every one. x86 joined the others when its
 * programs could draw on `/dev/fb0`, and its Screen is there even in a session that never opens it,
 * since seeing it is how a learner finds out that a program can draw
 * ([x86 devices](../../../../../../docs/design/x86-devices.md), "The Screen is always there").
 */
export function languageHasScreen(language: AvailableLanguages): boolean {
    return SCREEN_DEFAULTS[language] !== undefined
}

/**
 * Builds the peripherals a language needs, keeping whatever the caller already created. The Mouse
 * takes the Screen and the Keyboard rather than copies of their state, so a program that resizes its
 * Screen mid-run clamps against the new size and a click carries the modifiers actually held; x86's
 * input spans the Screen's size the same way.
 */
export function createInjectedPeripherals(
    language: AvailableLanguages,
    overrides: InjectedPeripheralOptions = {}
): InjectedPeripherals {
    const screen = overrides.screen ?? new Screen(defaultScreenOptions(language))
    const keyboard = overrides.keyboard ?? new Keyboard()
    const mouse = overrides.mouse ?? new Mouse({ screen, keyboard })
    const clock = overrides.clock ?? new ProgramClock()
    const random = overrides.random ?? new RandomSource()
    const fileSystem = overrides.fileSystem ?? new FileSystem()
    const audio = overrides.audio ?? new Audio({ clock })
    const x86Input = overrides.x86Input ?? new X86Input({ screen })
    return { screen, keyboard, mouse, clock, random, fileSystem, audio, x86Input }
}
