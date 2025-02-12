import type { AvailableLanguages } from "$lib/Project.svelte"
import type { BaseEmulatorActions, BaseEmulatorState, EmulatorSettings } from "./commonLanguageFeatures.svelte"
import { M68KEmulator } from "./M68KEmulator.svelte"
import { MIPSEmulator } from "./MIPSEmulator.svelte"


type EmulatorMap = {
    "MIPS": typeof MIPSEmulator
    "M68K": typeof M68KEmulator
}

type Emulator = BaseEmulatorActions & BaseEmulatorState

export function GenericEmulator<T extends AvailableLanguages>(type: T, baseCode: string, options?: EmulatorSettings): Emulator {
    if(type === "M68K"){
        return M68KEmulator(baseCode, options)
    }
    if(type === "MIPS"){
        return MIPSEmulator(baseCode, options)
    }
    throw new Error(`Unknown language ${type}`)
}