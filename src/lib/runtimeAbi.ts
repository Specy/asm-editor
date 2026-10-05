import type { AvailableLanguages } from './Project.svelte'

/**
 * The Runtime ABIs this editor ships an implementation of. A Project pins the ABI it links, never
 * an implementation, and receives the latest implementation of it
 * ([ADR 0031](../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
 */
export const RUNTIME_ABIS = ['v1'] as const
export type RuntimeAbi = (typeof RUNTIME_ABIS)[number]
/** The ABI new Compilations require. */
export const CURRENT_RUNTIME_ABI: RuntimeAbi = 'v1'

/**
 * The value of the *Link Runtime library* Setting: off, or the Runtime ABI the Build links. A name
 * of the ABI form that this editor does not ship (a Project saved by a newer editor) is kept rather
 * than dropped, and blocks the Build with an explanation.
 */
export type RuntimeLibrarySetting = 'off' | `v${number}`

/** The global a compiled program starts at: the Runtime library's startup code. */
export const RUNTIME_ENTRY_SYMBOL = '_start'

/** Library members live under this folder; a Project File there would be shadowed by the library. */
export const RUNTIME_NAMESPACE = '@runtime/'

export function isRuntimeAbiName(value: unknown): value is `v${number}` {
    return typeof value === 'string' && /^v[1-9][0-9]{0,3}$/.test(value)
}

export function isShippedRuntimeAbi(value: unknown): value is RuntimeAbi {
    return (RUNTIME_ABIS as readonly unknown[]).includes(value)
}

export function isRuntimeLibrarySetting(value: unknown): value is RuntimeLibrarySetting {
    return value === 'off' || isRuntimeAbiName(value)
}

/** The Targets a Runtime library exists for. */
export function hasRuntimeLibrary(language: AvailableLanguages): boolean {
    return language === 'RISC-V' || language === 'RISC-V-64' || language === 'MIPS'
}

/**
 * Why a Build cannot link this ABI, or undefined when it can. The remedy depends on who asked for
 * it: Generated assembly's Compilation record, fixed by compiling again, or the Setting.
 */
export function unsupportedRuntimeAbi(abi: string, required = false): string | undefined {
    if (isShippedRuntimeAbi(abi)) return undefined
    return required
        ? `This assembly was compiled against Runtime ABI ${abi}, which this editor does not provide. Recompile its source to build it.`
        : `The Project links Runtime ABI ${abi}, which this editor does not provide. Choose a supported one in the Link Runtime library Setting.`
}
