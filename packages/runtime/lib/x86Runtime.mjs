/** Runtime archive and startup inputs shared by editor builds, live checks and compatibility tests. */
export function x86RuntimeUnits(runtime, entrySymbol) {
    const startPath = runtime.index._start
    const startUnits = entrySymbol === '_start' ? { [startPath]: runtime.members[startPath] } : {}
    const hooks = runtime.resolveWeak ?? []
    if (hooks.length) {
        // Strong references pull weakly referenced hooks through the normal archive search.
        // User definitions are still searched before runtime definitions.
        startUnits[`@runtime/${runtime.abi}/resolve-weak.s`] = [
            'default rel',
            'section .rodata',
            ...hooks.map((name) => `extern ${name}`),
            ...hooks.map((name) => `dq ${name}`),
            ''
        ].join('\n')
    }
    return {
        library: Object.fromEntries(
            Object.entries(runtime.members).filter(([path]) => path !== startPath)
        ),
        ...(Object.keys(startUnits).length ? { startUnits } : {})
    }
}
