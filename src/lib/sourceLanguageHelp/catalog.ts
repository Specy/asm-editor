import { isShippedRuntimeAbi } from '$lib/runtimeAbi'
import {
    SOURCE_HELP_REVISION,
    type CompilerCapabilities
} from '$lib/sourceCompilation/capabilities'
import type { HelpCatalog, HelpEntry } from './types'
import type { HelpLanguage } from './context'

type Loader = () => Promise<{ default: unknown }>
const loaders: Record<string, Loader> = {
    'runtime:v1': () => import('./generated/runtime-v1.json'),
    MIPS: () => import('./generated/mips.json'),
    'RISC-V': () => import('./generated/riscv32.json'),
    'RISC-V-64': () => import('./generated/riscv64.json'),
    X86: () => import('./generated/x86_64.json')
}
/** Shares in-flight loads; a failed local asset can be retried on the next request. */
export function createCatalogLoader(assets: Record<string, Loader>) {
    const pending = new Map<string, Promise<HelpCatalog | undefined>>()
    return async (key: string): Promise<HelpCatalog | undefined> => {
        if (!assets[key]) return undefined
        let promise = pending.get(key)
        if (!promise) {
            promise = Promise.resolve()
                .then(assets[key])
                .then(({ default: data }) => data as HelpCatalog)
                .catch(() => {
                    pending.delete(key)
                    return undefined
                })
            pending.set(key, promise)
        }
        return promise
    }
}
const load = createCatalogLoader(loaders)

export async function sourceHelpEntries(
    capabilities: CompilerCapabilities | undefined,
    language: HelpLanguage
): Promise<HelpEntry[]> {
    if (!capabilities || capabilities.catalogRevision !== SOURCE_HELP_REVISION) return []
    const [environment, runtime] = await Promise.all([
        load(capabilities.target),
        isShippedRuntimeAbi(capabilities.headerAbi)
            ? load(`runtime:${capabilities.headerAbi}`)
            : undefined
    ])
    const headers = new Set(language === 'cpp' ? capabilities.headers.cpp : capabilities.headers.c)
    const route =
        capabilities.target === 'MIPS' ? 'mips' : capabilities.target === 'X86' ? 'x86' : 'risc-v'
    const result: HelpEntry[] = []
    for (const catalog of [environment, runtime]) {
        if (!catalog || catalog.revision !== capabilities.catalogRevision) continue
        if (catalog.target && catalog.target !== capabilities.target) continue
        if (catalog.abi && catalog.abi !== capabilities.headerAbi) continue
        for (const entry of catalog.entries) {
            if (entry.languages && !entry.languages.includes(language)) continue
            const available = entry.headers.filter((header) => headers.has(header))
            if (!available.length) continue
            result.push({
                ...entry,
                headers: available,
                href:
                    entry.href ??
                    (entry.kind === 'function'
                        ? `/documentation/${route}/runtime-library#${entry.name.replace(/^std::/, '')}`
                        : `/documentation/${route}/using-c#libraries`)
            })
        }
    }
    return result
}
