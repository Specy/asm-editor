#!/usr/bin/env node
/**
 * Writes the Environment library's committed headers, `src/lib/sourceRuntime/generated/sim/<target>.h`
 * for `mips`, `riscv32` and `riscv64`, from the syscall entries the Documentation shows and the
 * MARS/RARS device registers the editor runs on, and `x86_64` from the x86 syscall table and its
 * C bindings. Run it after changing any of them:
 *
 *   node scripts/sim-header/generate.mjs [--check]
 *
 * `--check` writes nothing and fails when a committed header or help catalog differs from its inputs,
 * which is what the editor's drift test runs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
    generateSimHeader,
    generateX86SimHeader,
    SIM_HEADER_DIRECTORY,
    SIM_HEADER_TARGETS,
    X86_SIM_HEADER
} from './simHeader.mjs'
import { marsHelpCatalog, x86HelpCatalog } from './helpCatalog.mjs'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * The data modules are the editor's TypeScript, which Node runs by stripping its types; what Node
 * does not do is resolve `$lib/` and extensionless relative imports the way Vite does.
 */
registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ? fileURLToPath(context.parentURL) : repository
        const base = specifier.startsWith('$lib/')
            ? join(repository, 'src', 'lib', specifier.slice('$lib/'.length))
            : /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)
              ? join(dirname(parent), specifier)
              : undefined
        if (base !== undefined)
            for (const candidate of [base, `${base}.ts`, `${base}.js`, join(base, 'index.ts')])
                if (existsSync(candidate) && /\.[cm]?[jt]s$/.test(candidate))
                    return nextResolve(pathToFileURL(candidate).href, context)
        return nextResolve(specifier, context)
    }
})

const load = (path) => import(pathToFileURL(join(repository, path)).href)
const { mipsSyscalls } = await load('src/lib/documentation/mars/mipsSyscalls.ts')
const { riscvSyscalls } = await load('src/lib/documentation/mars/riscvSyscalls.ts')
const devices = await load('src/lib/languages/mars/MarsDevices.ts')
const display = await load('src/lib/languages/mars/marsDisplay.ts')
const { x86SimHeaderData } = await load('src/lib/documentation/x86/syscallBinding.ts')

const address = (label) =>
    display.MARS_BASE_ADDRESS_CHOICES.find((choice) => choice.label === label).address
const data = {
    devices: {
        receiverControl: devices.MARS_RECEIVER_CONTROL,
        receiverData: devices.MARS_RECEIVER_DATA,
        transmitterControl: devices.MARS_TRANSMITTER_CONTROL,
        transmitterData: devices.MARS_TRANSMITTER_DATA,
        readyBit: devices.MARS_READY_BIT
    },
    display: {
        sizes: display.MARS_DISPLAY_SIZE_CHOICES,
        units: display.MARS_UNIT_SIZE_CHOICES,
        //GNU-profile static data can grow past the default heap; the Core moves the heap after it.
        staticData: address('static data'),
        staticDataEnd: 0x10400000
    }
}

const headers = [
    ...Object.entries(SIM_HEADER_TARGETS).map(([target, settings]) => {
        const syscalls = settings.syscalls === 'mips' ? mipsSyscalls : riscvSyscalls
        return [target, generateSimHeader(target, { ...data, syscalls })]
    }),
    [X86_SIM_HEADER.file, generateX86SimHeader(x86SimHeaderData())]
]
const catalogs = [
    ...Object.entries(SIM_HEADER_TARGETS).map(([target, settings]) => [
        target,
        marsHelpCatalog(target, settings.syscalls === 'mips' ? mipsSyscalls : riscvSyscalls)
    ]),
    [X86_SIM_HEADER.file, x86HelpCatalog(x86SimHeaderData())]
]

const check = process.argv.includes('--check')
let stale = false
const outputs = [
    ...headers.map(([target, text]) => [`${SIM_HEADER_DIRECTORY}/${target}.h`, text]),
    ...catalogs.map(([target, catalog]) => [
        `src/lib/sourceLanguageHelp/generated/${target}.json`,
        JSON.stringify(catalog) + '\n'
    ])
]
for (const [relative, text] of outputs) {
    const path = join(repository, relative)
    if (check) {
        if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
            console.error(`${relative} is out of date`)
            stale = true
        }
        continue
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    console.log(`wrote ${relative} (${Buffer.byteLength(text)} bytes)`)
}
if (stale) {
    console.error('Run node scripts/sim-header/generate.mjs to regenerate them.')
    process.exit(1)
}
