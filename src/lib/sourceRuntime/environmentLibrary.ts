import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * The Environment library, `<sim.h>`: one `static inline` function for each service a Target's
 * Documentation lists, generated per Target into `generated/sim/` by
 * `scripts/sim-header/generate.mjs` and uploaded with every compilation beside the Runtime
 * library's headers ([ADR 0034](../../../docs/adr/0034-environment-library-is-header-only.md)).
 * Nothing is linked, so it has no Runtime ABI, and only the Target's own text is uploaded.
 */

/** Its name among the system headers: `#include <sim.h>`. */
export const ENVIRONMENT_HEADER = 'sim.h'

/**
 * Where the editor shows it, read-only and outside the Project. No Runtime ABI in the path: nothing
 * is linked, and a Source map naming it belongs to a compilation of this session.
 */
export const ENVIRONMENT_HEADER_PATH = '@runtime/include/sim.h'

type Loader = () => Promise<{ default: string }>

//Lazily imported, so the text is downloaded with the first compilation that uploads it
const LOADERS: Partial<Record<AvailableLanguages, Loader>> = {
    MIPS: () => import('./generated/sim/mips.h?raw'),
    'RISC-V': () => import('./generated/sim/riscv32.h?raw'),
    'RISC-V-64': () => import('./generated/sim/riscv64.h?raw'),
    X86: () => import('./generated/sim/x86_64.h?raw')
}

const loaded = new Map<AvailableLanguages, string>()

/** Whether this Target's compilations get `<sim.h>`: every Target with Source compilation does. */
export function hasEnvironmentLibrary(target: AvailableLanguages): boolean {
    return Object.prototype.hasOwnProperty.call(LOADERS, target)
}

/** Loads (once) the Target's `<sim.h>`, or undefined for a Target that has none. */
export async function loadEnvironmentHeader(
    target: AvailableLanguages
): Promise<string | undefined> {
    const ready = loaded.get(target)
    if (ready !== undefined) return ready
    const loader = LOADERS[target]
    if (!loader) return undefined
    const text = (await loader()).default
    loaded.set(target, text)
    return text
}

/** The Target's `<sim.h>` once a compilation has loaded it, for synchronous readers. */
export function loadedEnvironmentHeader(target: AvailableLanguages): string | undefined {
    return loaded.get(target)
}

export function isEnvironmentHeaderPath(path: string): boolean {
    return path === ENVIRONMENT_HEADER_PATH
}
