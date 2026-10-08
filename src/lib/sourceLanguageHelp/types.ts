export type HelpEntry = {
    name: string
    kind: 'function' | 'macro' | 'type' | 'constant'
    declaration: string
    parameters?: { label: string; range: [number, number]; description?: string }[]
    headers: string[]
    summary: string
    href?: string
    languages?: ('c' | 'cpp' | 'header')[]
    /** Library entries have documentation destinations, not editable Project definitions. */
    definition?: 'documentation'
}
export type HelpCatalog = { revision: number; abi?: string; target?: string; entries: HelpEntry[] }
