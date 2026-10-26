import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type {
    BaseEmulatorActions,
    BaseEmulatorDerivedState,
    BaseEmulatorState,
    EmulatorSettings
} from './commonLanguageFeatures.svelte'
import type { EmulatorPeripherals } from './peripherals/peripheralSet'
import type { BuildInput } from '#lib/projectFiles.ts'
import { lazyLoad } from '#lib/lazyLoad.ts'

/**
 * Whether the user turned the WebAssembly builds of the MIPS and RISC-V Cores off, which is the way
 * to compare them with the JavaScript ones or to work around an engine that mishandles them:
 * `localStorage.setItem('core-backend', 'javascript')`.
 */
function webAssemblyCoresAllowed(): boolean {
    try {
        return globalThis.localStorage?.getItem('core-backend') !== 'javascript'
    } catch {
        return true
    }
}

/**
 * Moves a Core to its WebAssembly build, about twice as fast as the JavaScript one, before the first
 * program is made. It stays on JavaScript, without an error, in an engine that cannot run it.
 */
async function preferWebAssembly(useWebAssembly: () => Promise<string>): Promise<void> {
    if (webAssemblyCoresAllowed()) await useWebAssembly().catch(() => undefined)
}

const loadRiscv = lazyLoad(async () => {
    await preferWebAssembly(() => import('@specy/risc-v').then((m) => m.useWebAssembly()))
    return (await import('./RISC-V/RISC-VEmulator.svelte')).RISCVEmulator
})

type EmulatorFactory = (
    source: BuildInput,
    options?: EmulatorSettings
) => Emulator | Promise<Emulator>

/** Each language's adapter, imported with its Core when a Project of it is first opened. */
const loaders: Record<AvailableLanguages, () => Promise<EmulatorFactory>> = {
    M68K: lazyLoad(() => import('./M68K/M68KEmulator.svelte').then((i) => i.M68KEmulator)),
    MIPS: lazyLoad(async () => {
        await preferWebAssembly(() => import('@specy/mips').then((m) => m.useWebAssembly()))
        return (await import('./MIPS/MIPSEmulator.svelte')).MIPSEmulator
    }),
    'RISC-V': loadRiscv,
    'RISC-V-64': loadRiscv,
    X86: lazyLoad(() => import('./X86/X86Emulator.svelte').then((i) => i.X86Emulator)),
    Z80: lazyLoad(() => import('./Z80/Z80Emulator.svelte').then((i) => i.Z80Emulator))
}

function loadEmulator(type: AvailableLanguages) {
    if (!Object.hasOwn(loaders, type)) throw new Error(`Unknown language ${type}`)
    return loaders[type]()
}

/**
 * The peripherals the GUI observes: the Terminal it already read `stdOut` from, plus the Screen it
 * paints, the Keyboard and Mouse it feeds events to, and the clock a program's waits go through
 * ([ADR 0004](../../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)).
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
    return emulator(source, options)
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
