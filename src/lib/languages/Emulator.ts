import type { AvailableLanguages } from '$lib/Project.svelte'
import type {
    BaseEmulatorActions,
    BaseEmulatorState,
    EmulatorSettings
} from './commonLanguageFeatures.svelte'
import type { M68KEmulator } from './M68K/M68KEmulator.svelte'
import type { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import type { X86Emulator } from './X86/X86Emulator.svelte'
import type { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'

const instances = {
    M68K: null as Promise<typeof M68KEmulator> | null,
    MIPS: null as Promise<typeof MIPSEmulator> | null,
    X86: null as Promise<typeof X86Emulator> | null,
    'RISC-V': null as Promise<typeof RISCVEmulator> | null,
    'RISC-V-64': null as Promise<typeof RISCVEmulator> | null,
}

function loadEmulator(type: AvailableLanguages) {
    if (instances[type] === null) {
        if (type === 'M68K') {
            instances[type] = import('./M68K/M68KEmulator.svelte').then((i) => i.M68KEmulator)
        } else if (type === 'MIPS') {
            instances[type] = import('./MIPS/MIPSEmulator.svelte').then((i) => i.MIPSEmulator)
        } else if (type === 'RISC-V' || type === 'RISC-V-64') {
            instances['RISC-V'] = import('./RISC-V/RISC-VEmulator.svelte').then((i) => i.RISCVEmulator)
            instances['RISC-V-64'] = instances['RISC-V']
        } else if (type === 'X86') {
            instances[type] = import('./X86/X86Emulator.svelte').then((i) => i.X86Emulator)
        } else {
            throw new Error(`Unknown language ${type}`)
        }
    }
    return instances[type]
}

export type Emulator = BaseEmulatorActions & BaseEmulatorState

export async function GenericEmulator<T extends AvailableLanguages>(
    type: T,
    baseCode: string,
    options?: EmulatorSettings
): Promise<Emulator> {
    const emulator = await loadEmulator(type)
    return emulator(baseCode, options)
}
