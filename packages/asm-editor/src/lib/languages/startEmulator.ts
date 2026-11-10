import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type { BuildInput } from '#lib/projectFiles.ts'
import { createEmulator, type Emulator } from './Emulator'
import type { EmulatorSettings } from './commonLanguageFeatures.svelte'
import { createInjectedPeripherals } from './peripherals/peripheralSet'
import { createBrowserAudioOutput } from './peripherals/audio/browserAudioOutput'

/**
 * Starts loading the Emulator of a page: its Core is downloaded and the Emulator made on the
 * peripherals the page owns ([ADR 0004](../../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)),
 * which are made here at once, before the Core arrives. Anything `settings.peripherals` already holds
 * is kept. The page's sound is the browser's, which an Emulator made outside a page never gets; it
 * loads nothing until the program first sounds.
 */
export function startEmulator(
    language: AvailableLanguages,
    source: BuildInput,
    settings: Omit<EmulatorSettings, 'language'> = {}
): Promise<Emulator> {
    const peripherals = createInjectedPeripherals(language, settings.peripherals)
    peripherals.audio.setOutput(createBrowserAudioOutput())
    return createEmulator(language, source, { ...settings, language, peripherals })
}
