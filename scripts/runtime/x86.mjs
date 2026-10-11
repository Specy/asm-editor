// Compatibility checks execute the checked-out Core, as the MIPS/RISC-V runner does.
import {
    translateCompilerOutput,
    GCC_INTEL_V1
} from '../../emulators/x86/blink-js/dist/compiler-output.mjs'
import { createX86Emulator, END_OF_INPUT } from '../../emulators/x86/blink-js/dist/index.mjs'
export { GCC_INTEL_V1 }
import { x86RuntimeUnits } from '../../src/lib/sourceRuntime/x86Runtime.mjs'

/**
 * The same pinned GCC-to-NASM translation used by the editor, and each output line's zero-based
 * line in `sourceFile` (the name the library compile gives it with `#line`), or null for lines
 * from anywhere else, such as a function inlined from a header.
 */
export function prepareX86(lines, sourceFile) {
    const result = translateCompilerOutput(
        lines.map((line) => line.text),
        { profile: 'gcc-intel-v1' }
    )
    if (!result.ok) throw new Error(result.diagnostics.map((item) => item.message).join('\n'))
    return {
        text: result.text,
        map: result.lines.map((line) =>
            line.location && line.location.file === sourceFile ? line.location.line - 1 : null
        )
    }
}

/** Read the exported symbols in translated NASM (and the hand-written startup unit). */
export function analyzeX86(_path, text) {
    const defined = [],
        weak = [],
        references = []
    for (const match of text.matchAll(/^\s*(global|common|extern)\s+(\$?[^\s:,]+)(:weak)?/gm)) {
        const name = match[2].replace(/^\$/, '')
        if (match[1] === 'extern') references.push(name)
        else {
            defined.push(name)
            if (match[3]) weak.push(name)
        }
    }
    return { defined, weak, references, errors: [] }
}

/** Adapt the x86 Core to the corpus runner's assembly/execution interface. */
export async function makeX86Core(entry, text, library, normalTermination) {
    let world, inputRequest
    const native = await createX86Emulator({
        mode: 'NASM_trunk',
        callbacks: {
            stdout: (bytes) => world.stdout.push(...bytes),
            stderr: (bytes) => world.stderr.push(...bytes),
            inputRequest: (request) => {
                inputRequest = request
            }
        }
    })
    const project = {
        entry,
        files: { [entry]: text },
        ...x86RuntimeUnits(library, '_start')
    }
    return {
        setUndoSize() {},
        setUndoEnabled() {},
        async assemble() {
            const result = await native.compileProject(project)
            return {
                errors: result.ok
                    ? []
                    : result.errors.map((item) => ({
                          sourcePath: item.file,
                          sourceLine: item.line,
                          message: item.error
                      }))
            }
        },
        initialize() {
            native.initialize(0)
        },
        attachEnvironment(environment) {
            world = environment
        },
        async simulateWithLimit(limit) {
            native.mountProjectFileSystem(corpusFileSystem(world))
            native.setEnvironment({
                now: (id) =>
                    id === 2 || id === 3
                        ? Number(native.getInstructionsExecuted()) / 100000
                        : world.handlers.time()
            })
            while (!native.hasTerminated()) {
                const remaining = limit - Number(native.getInstructionsExecuted())
                if (remaining <= 0) throw new Error('instruction limit reached')
                const before = native.getInstructionsExecuted()
                await native.run(Math.min(remaining, 1_000_000))
                if (native.stopReason?.kind === 'input') {
                    const [count, bytes] = world.handlers.stdIn(Number(inputRequest.maxBytes))
                    native.provideInput(count ? Uint8Array.from(bytes) : END_OF_INPUT)
                } else if (native.stopReason?.kind === 'wait') {
                    throw new Error('unexpected wait in runtime corpus')
                } else if (!native.hasTerminated() && native.getInstructionsExecuted() === before)
                    throw new Error(
                        `made no progress (${native.state}, ${native.stopReason?.kind})`
                    )
            }
            if (native.stopReason?.kind !== 'exit')
                throw new Error(`program ended: ${native.stopReason?.details}`)
            return normalTermination
        },
        get terminated() {
            return native.hasTerminated()
        },
        get exitCode() {
            return native.stopReason?.exitCode ?? 0
        },
        dispose() {
            native.dispose()
        }
    }
}

/** Positional file capability over the same files and descriptors used by the other corpus Cores. */
function corpusFileSystem(world) {
    const { files, handles, handlers } = world
    const fail = (code) => {
        throw Object.assign(new Error(code), { code })
    }
    const handle = (fd) => handles.get(fd) ?? fail('EBADF')
    const resize = (path, length) => {
        if (!files.has(path)) fail('ENOENT')
        const bytes = new Uint8Array(length)
        bytes.set(files.get(path).subarray(0, length))
        files.set(path, bytes)
    }
    return {
        performInstruction: (_serial, operation) => operation(),
        open(path, flags) {
            if (!files.has(path) && !flags.create) fail('ENOENT')
            if (files.has(path) && flags.exclusive) fail('EEXIST')
            if (flags.create && !files.has(path)) files.set(path, new Uint8Array())
            if (flags.truncate) resize(path, 0)
            const mode =
                flags.access === 'read'
                    ? 0
                    : flags.access === 'read-write'
                      ? flags.append
                          ? 10
                          : 2
                      : flags.append
                        ? 9
                        : 1
            // The open above already applied O_TRUNC. Do not truncate again for plain O_WRONLY.
            const fd = handlers.openFile(path, mode === 1 ? 2 : mode, flags.append)
            if (mode === 1) handles.get(fd).mode = 'write'
            return fd
        },
        close: (fd) => {
            handle(fd)
            handlers.closeFile(fd)
        },
        pread(fd, position, length) {
            handle(fd)
            handlers.seekFile(fd, position, 0)
            const [count, bytes] = handlers.readFile(fd, length)
            if (count < 0) fail('EBADF')
            return Uint8Array.from(bytes)
        },
        pwrite(fd, position, bytes) {
            handle(fd)
            handlers.seekFile(fd, position, 0)
            const count = handlers.writeFile(fd, bytes)
            if (count < 0) fail('EBADF')
            return count
        },
        truncate: resize,
        ftruncate: (fd, length) => resize(handle(fd).path, length),
        stat: (path) =>
            path === ''
                ? { kind: 'directory', size: 0 }
                : files.has(path)
                  ? { kind: 'file', size: files.get(path).length }
                  : undefined,
        fstat: (fd) => ({ kind: 'file', size: files.get(handle(fd).path).length }),
        list: () => [...files.keys()].map((name) => ({ name, kind: 'file' })),
        rename(from, to) {
            if (!files.has(from)) fail('ENOENT')
            files.set(to, files.get(from))
            files.delete(from)
        },
        remove(path) {
            if (!files.delete(path)) fail('ENOENT')
        }
    }
}
