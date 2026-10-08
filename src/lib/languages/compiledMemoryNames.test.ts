import { expect, it } from 'vitest'
import { compiledMemoryNames, prepareMemoryNames } from './compiledMemoryNames'

it('demangles C++ data, preserves assembly names and collision suffixes, and previews literals', async () => {
    const sources = {
        entry: 'generated.s',
        files: {},
        compiledLanguages: { 'generated.s': 'cpp' as const }
    }
    await prepareMemoryNames(sources)
    const labels = compiledMemoryNames(
        [
            { name: '_ZN4Game5scoreE', address: 0n, fromLibrary: false, file: 'generated.s' },
            { name: 'cache.2', address: 1n, fromLibrary: false, file: 'generated.s' },
            { name: 'other.1', address: 2n, fromLibrary: false, file: 'generated.s' },
            { name: 'other.2', address: 3n, fromLibrary: false, file: 'generated.s' },
            { name: 'handwritten.1', address: 4n, fromLibrary: false, file: 'main.asm' },
            { name: '.LC0', address: 100n, fromLibrary: false, file: 'generated.s' }
        ],
        sources,
        (address) =>
            Uint8Array.of(new TextEncoder().encode('Hello\nworld\0')[Number(address - 100n)] ?? 0)
    )
    expect(labels.map((label) => label.displayName)).toEqual([
        'Game::score',
        'cache',
        'other.1',
        'other.2',
        'handwritten.1',
        '.LC0'
    ])
    expect(labels.at(-1)?.preview).toBe('Hello\\nworld')
})
