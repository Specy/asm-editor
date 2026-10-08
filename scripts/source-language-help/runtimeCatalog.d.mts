import type { HelpCatalog } from '../../src/lib/sourceLanguageHelp/types'

export function runtimeHelpCatalog(
    headers: Record<string, string>,
    functions: {
        abi: string
        functions: { name: string; header: string; prototype: string; doc: string }[]
    }
): HelpCatalog
