/**
 * The demangler module against names made to break it
 * ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md)): one whose text grows far
 * past its length, and one nested deeper than the module's stack.
 */
import { expect, it } from 'vite-plus/test'
import { demangledName } from './demangledNames'
import { loadDemangler, loadedDemangler, LONGEST_MANGLED_NAME } from './loadDemangler'

/** A mangled substitution by its number: `S_`, `S0_`, `S1_`, … `SA_`, … */
const substitution = (n: number) => (n === 0 ? 'S_' : `S${(n - 1).toString(36).toUpperCase()}_`)

/**
 * `f<levels>(B<B<…B<A, A>…, …>, …>)`: `levels` of `B<T, T>`, the second argument a substitution
 * of the first, so the text doubles with each level: 6 KB at 10 levels, 25 MB at 22 (162
 * characters), which took the module 1.3 s and the shortening 12 s more.
 */
function growing(levels: number): string {
    const name = `f${levels}`
    const seconds = Array.from({ length: levels - 1 }, (_, i) => `${substitution(i + 2)}E`)
    return `_Z${name.length}${name}1B${'IS_'.repeat(levels - 1)}I1AS0_E${seconds.join('')}`
}

/** Names whose reading tells a module that works. */
const SAMPLES = [
    '_ZNSolsEi',
    '_ZN4game6PlayerD0Ev',
    '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_',
    '_ZTVN4game4BossE',
    '_ZZ4mainENKUliE_clEi',
    '_ZGVZL8greetingvE4text',
    '_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_PKc'
]

it('reads a text up to 64 KiB, and gives up at once on one that grows past it', async () => {
    const { describe } = await loadDemangler()
    expect(describe(growing(10))?.text).toHaveLength(6144)
    expect(describe(growing(13))?.text).toHaveLength(49152)
    for (const levels of [14, 16, 22, 24, 30, 40, 100]) {
        const name = growing(levels)
        const started = performance.now()
        expect(describe(name), `${levels} levels`).toBeUndefined()
        expect(demangledName(name, describe), `${levels} levels`).toBeUndefined()
        expect(performance.now() - started, `${levels} levels`).toBeLessThan(250)
    }
    expect(describe('_ZNSolsEi')?.text).toBe('std::ostream::operator<<(int)')
})

it('discards a module that a name nested past its stack broke, and reads on with a fresh one', async () => {
    const first = await loadDemangler()
    const expected = SAMPLES.map((name) => JSON.stringify(first.describe(name)))
    let broken = 0
    // Around 3,610 pointers deep the module's 1 MB stack runs out: it once overwrote the module's
    // data there, and a little deeper never returned.
    const depths = [...Array.from({ length: 101 }, (_, i) => 3600 + i), LONGEST_MANGLED_NAME - 10]
    for (const depth of depths) {
        const demangler = await loadDemangler()
        const read = demangler.describe(`_Z1fP${'P'.repeat(depth)}i`)
        if (read) {
            expect(read.text, `${depth} deep`).toBe(`f(int${'*'.repeat(depth + 1)})`)
        } else {
            broken++
            // It reads nothing more, and the next load makes another.
            expect(demangler.describe('_ZNSolsEi'), `${depth} deep`).toBeUndefined()
            expect(loadedDemangler(), `${depth} deep`).toBeUndefined()
            expect(await loadDemangler(), `${depth} deep`).not.toBe(demangler)
        }
        const now = await loadDemangler()
        expect(
            SAMPLES.map((name) => JSON.stringify(now.describe(name))),
            `${depth} deep`
        ).toEqual(expected)
    }
    expect(broken).toBeGreaterThan(0)
})
