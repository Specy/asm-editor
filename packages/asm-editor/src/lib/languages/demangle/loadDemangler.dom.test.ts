/**
 * The demangler module in a browser-like context: its wasm is inlined, so it loads without a fetch
 * or a `locateFile`, as it must in the Listing worker.
 */
import { expect, it } from 'vite-plus/test'
import { demangledName } from './demangledNames'
import { loadDemangler, loadedDemangler } from './loadDemangler'

it('loads once and reads names under jsdom', async () => {
    expect(globalThis.window).toBeDefined()
    expect(loadedDemangler()).toBeUndefined()
    const loading = loadDemangler()
    expect(loadDemangler()).toBe(loading)
    const demangler = await loading
    expect(loadedDemangler()).toBe(demangler)
    expect(demangledName('_ZNSolsEi@plt', demangler.describe)?.signature).toBe(
        'std::ostream::operator<<(int)@plt'
    )
})
