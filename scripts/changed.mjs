#!/usr/bin/env node
/**
 * Formats, lints and tests only the files a change touched, for the checks between two steps of
 * it. The whole-repository checks, `pnpm format:check`, `pnpm lint`, `pnpm check` and `pnpm test`,
 * stay the ones to run before a change is done, and the ones CI runs.
 *
 *     node scripts/changed.mjs [format] [lint] [test] [--since <ref>]
 *
 * The changed files are the ones that differ from where the branch left `main`, committed or not,
 * and the untracked ones; `--since HEAD` takes only what is not committed yet. Each step gets the
 * whole list and its tool's own ignore rules leave out what it does not cover (the Cores, the
 * generated files):
 *
 * - `format` writes Oxfmt's formatting to them, as `pnpm format` does to every file.
 * - `lint` runs Oxlint on the scripts and ESLint on the Svelte files among them, as `pnpm lint` does
 *   on every file. ESLint's typed rules make it the slow half of `pnpm lint`, nearly two minutes
 *   for every Svelte file against seconds for a few.
 * - `test` runs the editor's tests that import a changed file, directly or not (`vitest related`),
 *   and the changed tests themselves. A changed Core is built first, as `pnpm test` builds them,
 *   and the tests that import its build run.
 *
 * Every step runs even when one before it fails, so that one run reports everything.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const editor = join(root, 'packages/asm-editor')
const vp = join(root, 'node_modules/.bin/vp')
const eslint = join(editor, 'node_modules/.bin/eslint')

/**
 * The Cores and the decompiler, submodules the editor imports as built packages, by the `dist`
 * their build tasks in `vite.config.ts` write: the tests that import those files are the ones a
 * change to the Core reaches.
 */
const CORES = {
    'packages/mips': 'packages/mips/marsjs/ts/dist',
    'packages/risc-v': 'packages/risc-v/rarsjs/ts/dist',
    'packages/m68k': 'packages/m68k/ts-lib/dist',
    'packages/x86': 'packages/x86/blink-js/dist',
    'packages/z80': 'packages/z80/packages/z80-machine/dist',
    'packages/decompiler': 'packages/decompiler/js/dist'
}

const SCRIPT = /\.(js|mjs|cjs|ts|mts|cts|jsx|tsx)$/
const SVELTE = /\.svelte(\.ts|\.js)?$/

const args = process.argv.slice(2)
const sinceAt = args.indexOf('--since')
const since = sinceAt === -1 ? undefined : args[sinceAt + 1]
const steps = args.filter((arg, index) => index !== sinceAt && index !== sinceAt + 1)
for (const step of steps) {
    if (!['format', 'lint', 'test'].includes(step)) {
        console.error(`changed: unknown step '${step}', expected format, lint or test`)
        process.exit(2)
    }
}

function git(...gitArgs) {
    const result = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) return undefined
    return result.stdout.trim()
}

function lines(text) {
    return text ? text.split('\n').filter(Boolean) : []
}

const base = since ?? git('merge-base', 'HEAD', 'main') ?? 'HEAD'
const diff = git('diff', '--name-only', '--diff-filter=d', base)
if (diff === undefined) {
    console.error(`changed: git cannot compare the working tree with '${base}'`)
    process.exit(2)
}
const paths = [
    ...new Set([...lines(diff), ...lines(git('ls-files', '--others', '--exclude-standard'))])
]
// A submodule is listed by its folder, and a file deleted since is not there to check.
const files = paths.filter(
    (path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile()
)
const changedCores = Object.keys(CORES).filter((core) => paths.includes(core))

const label = since ?? (base === git('rev-parse', 'HEAD') ? 'HEAD' : `main (${base.slice(0, 8)})`)
console.log(`changed: ${files.length} files since ${label}`)

function run(command, commandArgs, cwd = root) {
    console.log(`\n$ ${relative(root, command) || command} ${commandArgs.join(' ')}`)
    return spawnSync(command, commandArgs, { cwd, stdio: 'inherit' }).status === 0
}

function format() {
    if (files.length === 0) return true
    return run(vp, ['fmt', '--no-error-on-unmatched-pattern', ...files])
}

function lint() {
    const scripts = files.filter((file) => SCRIPT.test(file) && !SVELTE.test(file))
    const svelte = files
        .filter((file) => file.startsWith('packages/asm-editor/') && SVELTE.test(file))
        .map((file) => relative(editor, join(root, file)))
    if (scripts.length === 0 && svelte.length === 0) return true
    // The typed rules of both read the tsconfig that `svelte-kit sync` writes.
    let passed = run(vp, ['run', 'asm-editor#sync'])
    if (scripts.length > 0) {
        passed = run(vp, ['lint', '--no-error-on-unmatched-pattern', ...scripts]) && passed
    }
    if (svelte.length > 0) {
        passed = run(eslint, ['--no-warn-ignored', ...svelte], editor) && passed
    }
    return passed
}

function scriptsIn(folder) {
    return readdirSync(folder, { recursive: true })
        .map((file) => join(folder, file))
        .filter((file) => SCRIPT.test(file) && statSync(file).isFile())
}

function test() {
    if (files.length === 0 && changedCores.length === 0) return true
    if (changedCores.length > 0 && !run(vp, ['run', 'build:cores'])) return false
    const related = [
        ...files.map((file) => join(root, file)),
        ...changedCores.flatMap((core) => scriptsIn(join(root, CORES[core])))
    ]
    if (!run('node', ['scripts/search-model.mjs', '--optional'], editor)) return false
    return run(vp, ['test', 'related', '--run', '--passWithNoTests', ...related], editor)
}

const chosen = steps.length > 0 ? steps : ['format', 'lint', 'test']
const failed = chosen.filter((step) => !{ format, lint, test }[step]())
if (failed.length > 0) {
    console.error(`\nchanged: ${failed.join(', ')} failed`)
    process.exit(1)
}
