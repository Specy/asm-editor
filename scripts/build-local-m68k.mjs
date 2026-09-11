import { spawnSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageRoot = join(projectRoot, 'emulators', 'm68k', 'ts-lib')
const generatedRoot = join(packageRoot, 'src', 'pkg')
const outputRoot = join(packageRoot, 'dist')

run('npm', ['run', 'build-wasm'])

rmSync(outputRoot, { recursive: true, force: true })

// The package uses an older TypeScript than the app. Restrict automatic type discovery so the
// app's newer @types/node declarations do not leak across the submodule boundary.
run('npm', ['exec', '--', 'tsc', '--typeRoots', './node_modules/@types'])

cpSync(generatedRoot, join(outputRoot, 'pkg'), { recursive: true })
for (const filename of ['package.json', 'README.md', '.gitignore']) {
    rmSync(join(outputRoot, 'pkg', filename), { force: true })
}

console.log('Built the local @specy/s68k package.')

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: packageRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
}
