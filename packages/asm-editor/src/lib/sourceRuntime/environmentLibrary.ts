import type { AvailableLanguages } from '#lib/Project.svelte.ts'

/**
 * The Environment library, `<sim.h>`: one `static inline` function for each service a Target's
 * Documentation lists, generated per Target into `generated/sim/` by
 * `scripts/sim-header/generate.mjs` and uploaded with every compilation beside the Runtime
 * library's headers ([ADR 0034](../../../../../docs/adr/0034-environment-library-is-header-only.md)).
 * Nothing is linked, so it has no Runtime ABI, and only the Target's own text is uploaded.
 *
 * x86 also gets the Linux device interfaces the same way ([ADR 0070](../../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)):
 * headers under Linux's names (`<linux/fb.h>`, `<unistd.h>`, ...), whose POSIX calls are
 * `static inline` too, and NASM include files for hand-written assembly (`linux/fb.inc`), generated
 * from one table into `generated/x86/include/` by the same script.
 */

/** Its name among the system headers: `#include <sim.h>`. */
export const ENVIRONMENT_HEADER = 'sim.h'

/**
 * Where the editor shows these files, read-only and outside the Project, each at its path under
 * the include directory. No Runtime ABI in the path: nothing is linked, and a Source map naming one
 * belongs to a compilation of this session.
 */
export const ENVIRONMENT_INCLUDE_ROOT = '@runtime/include/'

export const ENVIRONMENT_HEADER_PATH = `${ENVIRONMENT_INCLUDE_ROOT}${ENVIRONMENT_HEADER}`

type Loader = () => Promise<{ default: string }>
type FilesLoader = () => Promise<{ default: Readonly<Record<string, string>> }>

//Lazily imported, so the text is downloaded with the first compilation that uploads it
const LOADERS: Partial<Record<AvailableLanguages, Loader>> = {
    MIPS: () => import('./generated/sim/mips.h?raw'),
    'RISC-V': () => import('./generated/sim/riscv32.h?raw'),
    'RISC-V-64': () => import('./generated/sim/riscv64.h?raw'),
    X86: () => import('./generated/sim/x86_64.h?raw')
}

//A Target's other files, every one in a single chunk
const FILE_LOADERS: Partial<Record<AvailableLanguages, FilesLoader>> = {
    X86: () => import('./x86DeviceFiles')
}

const loaded = new Map<AvailableLanguages, string>()
const loadedFiles = new Map<AvailableLanguages, Readonly<Record<string, string>>>()

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

/**
 * Loads (once) the Target's files besides `<sim.h>`, keyed by their path under the include
 * directory (`linux/fb.h`, `linux/fb.inc`): C headers end in `.h`, NASM include files in `.inc`.
 * Empty for a Target that has none.
 */
export async function loadEnvironmentFiles(
    target: AvailableLanguages
): Promise<Readonly<Record<string, string>>> {
    const ready = loadedFiles.get(target)
    if (ready) return ready
    const loader = FILE_LOADERS[target]
    if (!loader) return {}
    const files = (await loader()).default
    loadedFiles.set(target, files)
    return files
}

/** The C headers among a Target's files, which a C or C++ compilation uploads. */
export function environmentHeaders(
    files: Readonly<Record<string, string>>
): Record<string, string> {
    return Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.h')))
}

/** The NASM include files among a Target's files, which an assembly of NASM can `%include`. */
export function environmentNasmIncludes(
    files: Readonly<Record<string, string>>
): Record<string, string> {
    return Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.inc')))
}

/**
 * One of the Target's files, `<sim.h>` included, by its name under the include directory, once
 * something has loaded it; for synchronous readers.
 */
export function loadedEnvironmentFile(
    target: AvailableLanguages,
    name: string
): string | undefined {
    if (name === ENVIRONMENT_HEADER) return loaded.get(target)
    const files = loadedFiles.get(target)
    return files && Object.prototype.hasOwnProperty.call(files, name) ? files[name] : undefined
}

/** Where the editor shows a file of the include directory: `@runtime/include/linux/fb.h`. */
export function environmentFilePath(name: string): string {
    return `${ENVIRONMENT_INCLUDE_ROOT}${name}`
}

/** The name under the include directory of a path `environmentFilePath` made, or undefined. */
export function environmentFileName(path: string): string | undefined {
    if (!path.startsWith(ENVIRONMENT_INCLUDE_ROOT)) return undefined
    const name = path.slice(ENVIRONMENT_INCLUDE_ROOT.length)
    return /^(?:[\w.-]+\/)*[\w.-]+\.(?:h|inc)$/.test(name) && !/(?:^|\/)\.\.?\//.test(name)
        ? name
        : undefined
}

/**
 * Whether a path is one of these read-only files: `<sim.h>`, or a header or include file of the
 * Target's device interfaces.
 */
export function isEnvironmentHeaderPath(path: string): boolean {
    return environmentFileName(path) !== undefined
}
