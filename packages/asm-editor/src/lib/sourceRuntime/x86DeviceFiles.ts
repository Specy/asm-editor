/**
 * x86's device headers and NASM include files, keyed by their path under the include directory
 * (`linux/fb.h`, `linux/fb.inc`), as `scripts/sim-header/generate.mjs` writes them into
 * `generated/x86/include/` ([ADR 0070](../../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)).
 * `environmentLibrary.ts` imports this module lazily, so all of them arrive in one chunk with the
 * first x86 compilation.
 */
const DIRECTORY = './generated/x86/include/'

const files = import.meta.glob<string>('./generated/x86/include/**/*.{h,inc}', {
    query: '?raw',
    import: 'default',
    eager: true
})

const x86DeviceFiles: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(
        Object.entries(files)
            .map(([path, text]) => [path.slice(DIRECTORY.length), text] as const)
            .sort(([a], [b]) => (a < b ? -1 : 1))
    )
)

export default x86DeviceFiles
