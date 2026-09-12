import type { AvailableLanguages } from '$lib/Project.svelte'
import type {
    BaseEmulatorActions,
    BaseEmulatorDerivedState,
    BaseEmulatorState,
    EmulatorSettings
} from './commonLanguageFeatures.svelte'
import type { EmulatorPeripherals } from './peripherals/peripheralSet'
import type { BuildInput } from '$lib/projectFiles'
import type { M68KEmulator } from './M68K/M68KEmulator.svelte'
import type { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import type { X86Emulator } from './X86/X86Emulator.svelte'
import type { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'
import type { Z80Emulator } from './Z80/Z80Emulator.svelte'

const instances = {
    M68K: null as Promise<typeof M68KEmulator> | null,
    MIPS: null as Promise<typeof MIPSEmulator> | null,
    X86: null as Promise<typeof X86Emulator> | null, //X86Emulator2['create']
    'RISC-V': null as Promise<typeof RISCVEmulator> | null,
    'RISC-V-64': null as Promise<typeof RISCVEmulator> | null,
    Z80: null as Promise<typeof Z80Emulator> | null
}

function loadEmulator(type: AvailableLanguages) {
    if (instances[type] === null) {
        if (type === 'M68K') {
            instances[type] = import('./M68K/M68KEmulator.svelte').then((i) => i.M68KEmulator)
        } else if (type === 'MIPS') {
            instances[type] = import('./MIPS/MIPSEmulator.svelte').then((i) => i.MIPSEmulator)
        } else if (type === 'RISC-V' || type === 'RISC-V-64') {
            instances['RISC-V'] = import('./RISC-V/RISC-VEmulator.svelte').then(
                (i) => i.RISCVEmulator
            )
            instances['RISC-V-64'] = instances['RISC-V']
        } else if (type === 'X86') {
            instances[type] = import('./X86/X86Emulator.svelte').then((i) => i.X86Emulator)
        } else if (type === 'Z80') {
            instances[type] = import('./Z80/Z80Emulator.svelte').then((i) => i.Z80Emulator)
        } else {
            throw new Error(`Unknown language ${type}`)
        }
    }
    return instances[type]
}

/**
 * The peripherals the GUI observes: the Terminal it already read `stdOut` from, plus the Screen it
 * paints, the Keyboard and Mouse it feeds events to, and the clock a program's waits go through
 * ([ADR 0004](../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)).
 */
export type EmulatorPeripheralAccess = {
    readonly peripherals: EmulatorPeripherals
}

export type Emulator = BaseEmulatorActions &
    BaseEmulatorState &
    BaseEmulatorDerivedState &
    EmulatorPeripheralAccess

export async function createEmulator<T extends AvailableLanguages>(
    type: T,
    source: BuildInput,
    options?: EmulatorSettings
): Promise<Emulator> {
    const emulator = await loadEmulator(type)
    return emulator!(source, options)
}

export function preloadAllEmulators() {
    return Promise.all([
        loadEmulator('M68K'),
        loadEmulator('MIPS'),
        loadEmulator('RISC-V'),
        loadEmulator('X86'),
        loadEmulator('Z80')
    ])
}
