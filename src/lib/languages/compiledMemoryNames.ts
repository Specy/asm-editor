import type { DataLabel } from './commonLanguageFeatures.svelte'
import type { BuildSources } from '$lib/projectFiles'
import type { DemangleModule } from './demangle/module'

let demangler: DemangleModule | undefined
let loading: Promise<void> | undefined
/** Load the demangler only for a C++ Build, before touching a Core. */
export async function prepareMemoryNames(sources: BuildSources): Promise<void> {
    if (!Object.values(sources.compiledLanguages ?? {}).includes('cpp')) return
    loading ??= import('./demangle/module.js').then(async ({ default: create }) => {
        demangler = await create()
    })
    await loading
}

export function compiledMemoryNames(
    labels: readonly DataLabel[],
    sources: BuildSources,
    read: (address: bigint, length: bigint) => Uint8Array
): DataLabel[] {
    if (!Object.keys(sources.compiledLanguages ?? {}).length) return [...labels]
    const named = labels.map((label) => {
        const compiled =
            label.fromLibrary || !!(label.file && sources.compiledLanguages?.[label.file])
        if (!compiled) return { ...label, displayName: label.name, suffixless: label.name }
        let displayName = label.name
        if (demangler && /^_Z/.test(label.name)) {
            const pointer = demangler.ccall('demangle', 'number', ['string'], [label.name])
            if (pointer) {
                try {
                    displayName = demangler.UTF8ToString(pointer)
                } finally {
                    demangler._free(pointer)
                }
            }
        }
        const suffixless = displayName.replace(/\.\d+$/, '')
        let preview: string | undefined
        if (/^[.$]LC\d+/.test(label.name)) {
            const bytes: number[] = []
            try {
                for (let offset = 0; offset < 97; offset++) {
                    const byte = read(label.address + BigInt(offset), 1n)[0]
                    if (byte === 0 || byte === undefined) break
                    bytes.push(byte)
                }
                const text = new TextDecoder()
                    .decode(Uint8Array.from(bytes))
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t')
                const characters = [...text]
                preview = characters.slice(0, 24).join('') + (characters.length > 24 ? '…' : '')
            } catch {
                /* An unmapped string has no preview; its symbol remains useful. */
            }
        }
        return { ...label, displayName, suffixless, preview }
    })
    const counts = new Map<string, number>()
    for (const label of named) counts.set(label.suffixless, (counts.get(label.suffixless) ?? 0) + 1)
    return named.map(({ suffixless, ...label }) => ({
        ...label,
        displayName: counts.get(suffixless) === 1 ? suffixless : label.displayName
    }))
}
