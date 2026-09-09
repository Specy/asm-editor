import type { AvailableLanguages } from '$lib/Project.svelte'
import { Keyboard } from './Keyboard'
import { Mouse } from './Mouse'
import { ProgramClock } from './ProgramClock'
import { SCREEN_CELL_8X16, SCREEN_CELL_8X8, type ScreenCellSize } from './screen/bitmapFont'
import { Screen, type ScreenOptions } from './screen/Screen'
import type { Terminal } from './Terminal.svelte'
import { FileSystem } from './FileSystem'

/**
 * The peripherals an Emulator owns besides its Terminal, injected at the Emulator boundary so the
 * GUI observes the very instances the Core draws on and reads from
 * ([ADR 0004](../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)). The Terminal is
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
    fileSystem: FileSystem
}

/** What a caller may hand an Emulator; anything it leaves out is built from the language defaults. */
export type InjectedPeripheralOptions = Partial<InjectedPeripherals>

export type EmulatorPeripherals = InjectedPeripherals & { terminal: Terminal }

/**
 * The Screen a language starts with, from the display table of the design record: EASy68K's minimum
 * window for the M68K, the Z80's default resolution, and MARS's bitmap display defaults for MIPS and
 * RISC-V. The program (M68K, Z80) or the user (MIPS, RISC-V) changes it from there.
 *
 * x86 has no Screen of its own — `@specy/x86` wraps a Linux userland with no graphics device — but
 * it still gets one so that every Emulator has the same shape; nothing ever draws on it.
 */
type ScreenDefaults = { width: number; height: number; cell: ScreenCellSize }

const SCREEN_DEFAULTS: Record<AvailableLanguages, ScreenDefaults> = {
    M68K: { width: 640, height: 480, cell: SCREEN_CELL_8X16 },
    Z80: { width: 256, height: 192, cell: SCREEN_CELL_8X8 },
    MIPS: { width: 512, height: 256, cell: SCREEN_CELL_8X16 },
    'RISC-V': { width: 512, height: 256, cell: SCREEN_CELL_8X16 },
    'RISC-V-64': { width: 512, height: 256, cell: SCREEN_CELL_8X16 },
    X86: { width: 640, height: 480, cell: SCREEN_CELL_8X16 }
}

export function defaultScreenOptions(language: AvailableLanguages): ScreenOptions {
    return { ...(SCREEN_DEFAULTS[language] ?? SCREEN_DEFAULTS.M68K) }
}

/**
 * Whether the Screen panel is shown for a language. x86 is the exception the design record makes:
 * `@specy/x86` wraps a Linux userland with no graphics device, so its Screen exists only to keep
 * every Emulator the same shape and nothing will ever draw on it.
 */
export function languageHasScreen(language: AvailableLanguages): boolean {
    return language !== 'X86'
}

/**
 * Builds the peripherals a language needs, keeping whatever the caller already created. The Mouse
 * takes the Screen and the Keyboard rather than copies of their state, so a program that resizes its
 * Screen mid-run clamps against the new size and a click carries the modifiers actually held.
 */
export function createInjectedPeripherals(
    language: AvailableLanguages,
    overrides: InjectedPeripheralOptions = {}
): InjectedPeripherals {
    const screen = overrides.screen ?? new Screen(defaultScreenOptions(language))
    const keyboard = overrides.keyboard ?? new Keyboard()
    const mouse = overrides.mouse ?? new Mouse({ screen, keyboard })
    const clock = overrides.clock ?? new ProgramClock()
    const fileSystem = overrides.fileSystem ?? new FileSystem()
    return { screen, keyboard, mouse, clock, fileSystem }
}
