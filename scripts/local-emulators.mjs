#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const emulators = {
    mips: {
        packageName: '@specy/mips',
        packageRoot: 'emulators/mips/marsjs/ts',
        entrypoint: 'dist/index.mjs'
    },
    'risc-v': {
        packageName: '@specy/risc-v',
        packageRoot: 'emulators/risc-v/rarsjs/ts',
        entrypoint: 'dist/index.mjs'
    },
    m68k: {
        packageName: '@specy/s68k',
        packageRoot: 'emulators/m68k/ts-lib',
        entrypoint: 'dist/index.js'
    },
    x86: {
        packageName: '@specy/x86',
        packageRoot: 'emulators/x86/blink-js',
        entrypoint: 'dist/index.mjs'
    },
    z80: {
        packageName: '@specy/z80',
        localPackageNames: ['@specy/z80', 'z80-machine'],
        packageRoot: 'emulators/z80/packages/z80-machine',
        entrypoint: 'dist/index.js'
    }
}

const [, , action = 'status', ...requestedNames] = process.argv

switch (action) {
    case 'status':
        showStatus(normalizeNames(requestedNames))
        break
    case 'link':
        linkLocalPackages(normalizeNames(requestedNames))
        break
    case 'registry':
        if (requestedNames.length) {
            fail(
                'The registry action restores all emulator packages; do not pass an emulator name.'
            )
        }
        restoreRegistryPackages()
        break
    default:
        fail(`Unknown action "${action}". Use status, link, or registry.`)
}

function normalizeNames(requested) {
    const normalized = requested.map((name) => (name === 'riscv' ? 'risc-v' : name))
    const unknown = normalized.filter((name) => !(name in emulators))
    if (unknown.length) {
        fail(
            `Unknown emulator${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. ` +
                `Choose from ${Object.keys(emulators).join(', ')}.`
        )
    }
    return normalized.length ? [...new Set(normalized)] : Object.keys(emulators)
}

function showStatus(selectedNames) {
    for (const name of selectedNames) {
        const emulator = emulators[name]
        const local = localRoot(emulator)
        const installed = installedRoot(emulator)
        const localVersion = readPackageVersion(local)
        const installedInfo = lstatIfPresent(installed)

        let source
        if (!installedInfo) {
            source = 'not installed'
        } else if (installedInfo.isSymbolicLink()) {
            const target = linkTarget(installed)
            source = samePath(target, local)
                ? `local${localVersion ? ` (${localVersion})` : ''}`
                : `other symlink -> ${target}`
        } else {
            const version = readPackageVersion(installed)
            source = `npm${version ? ` (${version})` : ''}`
        }

        const build = lstatIfPresent(join(local, emulator.entrypoint)) ? 'built' : 'not built'
        console.log(
            `${name.padEnd(6)} ${source}; local source ${localVersion ? 'ready' : 'missing'}, ${build}`
        )
    }
}

function linkLocalPackages(selectedNames) {
    for (const name of selectedNames) validateLocalPackage(name, emulators[name])

    for (const name of selectedNames) {
        const emulator = emulators[name]
        const local = localRoot(emulator)
        const installed = installedRoot(emulator)
        const installedInfo = lstatIfPresent(installed)

        if (installedInfo?.isSymbolicLink() && !samePath(linkTarget(installed), local)) {
            fail(
                `${emulator.packageName} is already a symlink to ${linkTarget(installed)}; leaving it untouched.`
            )
        }

        if (installedInfo) rmSync(installed, { recursive: true, force: true })
        mkdirSync(dirname(installed), { recursive: true })

        const target = process.platform === 'win32' ? local : relative(dirname(installed), local)
        symlinkSync(target, installed, process.platform === 'win32' ? 'junction' : 'dir')
        console.log(`Linked ${emulator.packageName} -> ${emulator.packageRoot}`)
    }

    clearViteCache()
}

function restoreRegistryPackages() {
    for (const name of Object.keys(emulators)) {
        const emulator = emulators[name]
        const installed = installedRoot(emulator)
        const info = lstatIfPresent(installed)
        if (!info?.isSymbolicLink()) continue

        const target = linkTarget(installed)
        if (!samePath(target, localRoot(emulator))) {
            fail(
                `${emulator.packageName} points to ${target}; refusing to remove an unrelated symlink.`
            )
        }
        rmSync(installed, { recursive: true, force: true })
    }

    clearViteCache()
    run('npm', ['install'])
    console.log('Restored emulator packages from npm.')
}

function validateLocalPackage(name, emulator) {
    const local = localRoot(emulator)
    const packageJsonPath = join(local, 'package.json')
    if (!lstatIfPresent(packageJsonPath)) {
        fail(
            `${name} source is not initialized at ${emulator.packageRoot}. ` +
                'Run npm run emulators:init first.'
        )
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const acceptedNames = emulator.localPackageNames ?? [emulator.packageName]
    if (!acceptedNames.includes(packageJson.name)) {
        fail(
            `${emulator.packageRoot} contains package ${packageJson.name}, expected ${acceptedNames.join(' or ')}.`
        )
    }

    if (!lstatIfPresent(join(local, emulator.entrypoint))) {
        fail(
            `${name} has not been built (${emulator.entrypoint} is missing). ` +
                `Run npm run emulators:build:${name} first.`
        )
    }
}

function clearViteCache() {
    const viteCache = join(projectRoot, 'node_modules', '.vite')
    if (lstatIfPresent(viteCache)) {
        rmSync(viteCache, { recursive: true, force: true })
        console.log('Cleared Vite dependency cache.')
    }
}

function localRoot(emulator) {
    return join(projectRoot, emulator.packageRoot)
}

function installedRoot(emulator) {
    return join(projectRoot, 'node_modules', ...emulator.packageName.split('/'))
}

function linkTarget(path) {
    return resolve(dirname(path), readlinkSync(path))
}

function samePath(left, right) {
    return resolve(left) === resolve(right)
}

function readPackageVersion(root) {
    try {
        return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
    } catch {
        return undefined
    }
}

function lstatIfPresent(path) {
    try {
        return lstatSync(path)
    } catch (error) {
        if (error?.code === 'ENOENT') return undefined
        throw error
    }
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
}

function fail(message) {
    console.error(message)
    process.exit(1)
}
