// Packs the example Projects kept as folders under examples/ into .asmproj archives, the editor's
// ZIP Project format (docs/adr/0019-zip-project-archives.md): a project.json manifest, and each
// File's bytes under files/. Every File of the folder and its subfolders goes in, at its path from
// the folder, except the archive itself.
//
// A C Program travels with its Generated assembly, a File of the folder that the editor's Compile
// made, and the Compilation record that ties the two together. The record's fingerprints are
// computed here with the editor's own code, so the editor reads the assembly as up to date; the
// RISC-V example test checks that it does.
//
// Run from packages/asm-editor after changing an example: node scripts/pack-example-projects.mjs
// After changing a C source, Compile it again in the editor first and save the Generated assembly
// into the folder: the archive is only as current as that File.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

// The editor's modules import each other without the `.ts` extension, as Vite resolves them
registerHooks({
    resolve(specifier, context, next) {
        if (/^[.#]/.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
            for (const suffix of ['.ts', '/index.ts']) {
                try {
                    const resolved = next(specifier + suffix, context)
                    if (existsSync(fileURLToPath(resolved.url))) return resolved
                } catch {
                    //not this one
                }
            }
        }
        return next(specifier, context)
    }
})
const { compilationInputs } = await import('../src/lib/sourceCompilation/compilationInputs.ts')
const { fileFingerprint } = await import('../src/lib/sourceCompilation/fingerprints.ts')

/** Files the editor keeps as bytes; everything else is UTF-8 text. */
const BINARY = /\.(bmp|png|jpe?g|gif|bin|wav|mid)$/i
/** A fixed time, so packing an unchanged folder gives the same archive. */
const PACKED_AT = Date.UTC(2026, 9, 23)

const EXAMPLES = [
    {
        folder: 'examples/risc-v/pacman',
        archive: 'pacman.asmproj',
        name: 'Pac-Man',
        description: 'The Pacman arcade game with audio, implemented in RISC-V and C.',
        language: 'RISC-V',
        programs: {
            //what the Entry's @screen directive configures, so the Screen is right before a Build
            'assembly/main.s': {
                display: {
                    unitWidth: 1,
                    unitHeight: 1,
                    width: 224,
                    height: 288,
                    baseAddress: 0x10010000
                }
            },
            //SIM_SCREEN writes the same directive into the Generated assembly
            'c/pacman.c.riscv': {}
        },
        selectedProgram: 'assembly/main.s',
        //as the editor's Compile wrote it for -O2, the level the game needs for 60 frames a second
        compilations: [
            {
                assemblerProfile: 'gnu-compiler-v1',
                runtimeAbi: 'v1',
                sourcePath: 'c/pacman.c',
                outputPath: 'c/pacman.c.riscv',
                target: 'RISC-V',
                language: 'c',
                compilerId: 'rv32-cclang2110',
                optimization: '2'
            }
        ],
        openTabs: ['README.md', 'assembly/main.s', 'c/pacman.c', 'assets/sprites.bmp'],
        activeTab: 'assembly/main.s',
        fileViews: { 'README.md': 'preview' }
    }
]

/** The Files under `directory`, as paths from it with forward slashes. */
function walk(directory, root = directory) {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name)
        return statSync(path).isDirectory()
            ? walk(path, root)
            : [relative(root, path).split('\\').join('/')]
    })
}

for (const example of EXAMPLES) {
    const names = walk(example.folder)
        .filter((name) => name !== example.archive)
        .sort()
    const entries = {}
    const manifestFiles = {}
    //each File as a Project holds it, which is what the fingerprints are taken of
    const projectFiles = {}
    for (const name of names) {
        const bytes = readFileSync(join(example.folder, name))
        const encoding = BINARY.test(name) ? 'base64' : 'plain'
        manifestFiles[name] = { encoding }
        projectFiles[name] = {
            encoding,
            content: encoding === 'base64' ? bytes.toString('base64') : bytes.toString('utf8')
        }
        entries[`files/${name}`] = [new Uint8Array(bytes), { mtime: PACKED_AT }]
    }
    const compilations = example.compilations.map((record) => {
        if (!projectFiles[record.outputPath])
            throw new Error(`${record.outputPath} is missing: Compile ${record.sourcePath} first`)
        return {
            ...record,
            inputs: compilationInputs(record.sourcePath, projectFiles),
            outputFingerprint: fileFingerprint(projectFiles[record.outputPath])
        }
    })
    //version 3: Programs keyed by Entry path, which several Programs need
    const manifest = {
        version: 3,
        project: {
            id: '',
            name: example.name,
            description: example.description,
            language: example.language,
            createdAt: PACKED_AT,
            updatedAt: PACKED_AT,
            programs: Object.fromEntries(
                Object.entries(example.programs).map(([entry, program]) => [
                    entry,
                    { settings: {}, testcases: [], ...program }
                ])
            ),
            selectedProgram: example.selectedProgram,
            compilations,
            openTabs: example.openTabs,
            activeTab: example.activeTab,
            fileViews: example.fileViews
        },
        files: manifestFiles
    }
    entries['project.json'] = [
        new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        { mtime: PACKED_AT }
    ]
    const archive = zipSync(entries, { level: 6 })
    writeFileSync(join(example.folder, example.archive), archive)
    console.log(
        `${join(example.folder, example.archive)}: ${names.length} Files, ${archive.length} bytes`
    )
}
