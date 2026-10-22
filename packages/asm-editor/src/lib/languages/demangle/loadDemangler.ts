import type { ElfAnalysis } from '#lib/listing/decoder.ts'
import type { Describe, Description } from './demangledNames'
import type { DemangleModule } from './module'

/**
 * The C++ demangler, loaded once per JavaScript context, the Listing worker's and the main
 * thread's alike, and only when a program has mangled names: the module is about 100 KB, its wasm
 * inlined, so it needs no fetch and no `locateFile` in a worker.
 */
export type Demangler = { describe: Describe }

/**
 * The longest name the module is asked to read, 30 times libstdc++'s longest. The module passes a
 * name on its 1 MB stack, and a deeper one could only be made to exhaust it.
 */
export const LONGEST_MANGLED_NAME = 8192

const FIELDS = 9

let loading: Promise<Demangler> | undefined
let loaded: Demangler | undefined

/** Loads the module on first use; a failed load is tried again by the next call. */
export function loadDemangler(): Promise<Demangler> {
    loading ??= import('./module.js').then(async ({ default: create }) => {
        loaded = demanglerOf(await create())
        return loaded
    })
    loading.catch(() => {
        loading = undefined
    })
    return loading
}

/** The demangler once {@link loadDemangler} has loaded it in this context, else undefined. */
export function loadedDemangler(): Demangler | undefined {
    return loaded
}

/**
 * Whether a program's names need the demangler: any `_Z` name in its symbol tables or its
 * relocations, so a C program never loads it and a stripped C++ one does through its dynamic
 * symbols.
 */
export function needsDemangler(
    analysis: Pick<ElfAnalysis, 'symbols' | 'dynamicSymbols' | 'relocations'>
): boolean {
    return (
        analysis.symbols.some((symbol) => symbol.name.startsWith('_Z')) ||
        analysis.dynamicSymbols.some((symbol) => symbol.name.startsWith('_Z')) ||
        analysis.relocations.some((relocation) => relocation.symbol.startsWith('_Z'))
    )
}

/** `describe` over an instantiated module (`scripts/demangle/demangle.cpp`). */
export function demanglerOf(module: DemangleModule): Demangler {
    return {
        describe(mangled: string): Description | undefined {
            if (!mangled.startsWith('_Z') || mangled.length > LONGEST_MANGLED_NAME) return undefined
            const stack = module.stackSave()
            let pointer: number
            try {
                pointer = module.ccall('describe', 'number', ['string'], [mangled])
            } catch {
                // A name nested deeper than the stack: the module unwound without restoring it.
                module.stackRestore(stack)
                return undefined
            }
            if (!pointer) return undefined
            let fields: string[]
            try {
                fields = module.UTF8ToString(pointer).split('\x1f')
            } finally {
                module._free(pointer)
            }
            if (fields.length !== FIELDS) return undefined
            const [kind, text, special, name, parameters, returns, qualifiers, variant, clone] =
                fields
            return {
                kind: kind === 'function' ? 'function' : 'data',
                text,
                special,
                name,
                parameters,
                returns,
                qualifiers,
                variant,
                clone
            }
        }
    }
}
