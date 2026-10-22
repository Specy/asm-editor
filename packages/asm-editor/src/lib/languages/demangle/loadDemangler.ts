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
 * name on its 1 MB stack, which a name nested a few thousand levels deep exhausts: the module then
 * traps, and is discarded (`demanglerOf`).
 */
export const LONGEST_MANGLED_NAME = 8192

const FIELDS = 9

let loading: Promise<Demangler> | undefined
let loaded: Demangler | undefined

/**
 * Loads the module on first use; a failed load is tried again by the next call, and so is one
 * whose module has since thrown, which reads nothing more.
 */
export function loadDemangler(): Promise<Demangler> {
    loading ??= import('./module.js').then(async ({ default: create }) => {
        const demangler: Demangler = demanglerOf(await create(), () => {
            if (loaded !== demangler) return
            loaded = undefined
            loading = undefined
        })
        loaded = demangler
        return demangler
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

/**
 * `describe` over an instantiated module (`scripts/demangle/demangle.cpp`). A call the module
 * throws in leaves its memory in no state to read again: a name nested deeper than its stack traps
 * (the stack is linked below its data, so an overflow traps rather than overwriting them), possibly
 * inside `malloc`, and what it had allocated is never freed. From then on this demangler reads
 * nothing, and `discard` is told so that the next load makes a fresh one.
 */
export function demanglerOf(module: DemangleModule, discard: () => void = () => {}): Demangler {
    let broken = false
    return {
        describe(mangled: string): Description | undefined {
            if (broken || !mangled.startsWith('_Z') || mangled.length > LONGEST_MANGLED_NAME)
                return undefined
            let fields: string[]
            try {
                const pointer = module.ccall('describe', 'number', ['string'], [mangled])
                if (!pointer) return undefined
                try {
                    fields = module.UTF8ToString(pointer).split('\x1f')
                } finally {
                    module._free(pointer)
                }
            } catch {
                broken = true
                discard()
                return undefined
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
