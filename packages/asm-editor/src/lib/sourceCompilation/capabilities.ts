import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { CURRENT_RUNTIME_ABI, isShippedRuntimeAbi } from '#lib/runtimeAbi.ts'
import { isCompilationTarget, type CompilationTarget } from './records'

/** Header availability shared by Compile and source help; no compiler or Core imports. */
export const HOSTED_C_HEADERS = [
    'assert.h',
    'ctype.h',
    'errno.h',
    'float.h',
    'inttypes.h',
    'iso646.h',
    'limits.h',
    'math.h',
    'stdarg.h',
    'stdbool.h',
    'stddef.h',
    'stdint.h',
    'stdio.h',
    'stdlib.h',
    'stdnoreturn.h',
    'string.h',
    'time.h'
] as const
export const HOSTED_CPP_HEADERS = [
    'cassert',
    'cctype',
    'cerrno',
    'cfloat',
    'cinttypes',
    'climits',
    'cmath',
    'cstdarg',
    'cstddef',
    'cstdint',
    'cstdio',
    'cstdlib',
    'cstring',
    'ctime',
    'new'
] as const
/**
 * x86's own headers, the Linux device interfaces generated into
 * `sourceRuntime/generated/x86/include/` ([ADR 0070](../../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md));
 * its `<time.h>` adds to the Runtime library's. The POSIX calls among them set the Runtime
 * library's `errno`, so they come with its headers.
 */
export const X86_DEVICE_HEADERS = [
    'dirent.h',
    'fcntl.h',
    'linux/fb.h',
    'linux/input-event-codes.h',
    'linux/input.h',
    'linux/ioctl.h',
    'linux/kd.h',
    'linux/soundcard.h',
    'linux/types.h',
    'poll.h',
    'signal.h',
    'sound/asound.h',
    'sys/ioctl.h',
    'sys/mman.h',
    'sys/select.h',
    'sys/soundcard.h',
    'sys/stat.h',
    'sys/time.h',
    'sys/types.h',
    'termios.h',
    'unistd.h'
] as const
/**
 * MIPS and RISC-V's own headers, the POSIX functions over the folder calls, which the Runtime
 * library's `posix/` implements ([ADR 0072](../../../../../docs/adr/0072-mips-and-risc-v-folder-calls-continue-rars-s-linux-numbering.md));
 * its `<errno.h>` and `<stdio.h>` add to the shared ones.
 */
export const POSIX_HEADERS = ['dirent.h', 'sys/stat.h', 'sys/types.h', 'unistd.h'] as const
export const SOURCE_HELP_REVISION = 1

export type CompilerCapabilities = Readonly<{
    target: CompilationTarget
    headerAbi: string
    runtimeAbi?: string
    catalogRevision: number
    headers: Readonly<{ c: readonly string[]; cpp: readonly string[] }>
}>

export function compilerCapabilities(
    target: AvailableLanguages,
    abi: string = CURRENT_RUNTIME_ABI
): CompilerCapabilities | undefined {
    if (!isCompilationTarget(target)) return undefined
    const headerAbi = abi
    const available = isShippedRuntimeAbi(headerAbi)
    const device = !available ? [] : target === 'X86' ? X86_DEVICE_HEADERS : POSIX_HEADERS
    const c = available ? [...HOSTED_C_HEADERS, ...device, 'sim.h'] : ['sim.h']
    const cpp = available ? [...c, ...HOSTED_CPP_HEADERS] : ['sim.h']
    return Object.freeze({
        target,
        headerAbi,
        runtimeAbi: abi,
        catalogRevision: SOURCE_HELP_REVISION,
        headers: Object.freeze({ c: Object.freeze(c), cpp: Object.freeze(cpp) })
    })
}
