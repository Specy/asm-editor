import { execFileSync, spawnSync } from 'node:child_process'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { runtimeRoot } from '@asm-editor/runtime/paths'
import { afterAll, describe, expect, it, vi } from 'vite-plus/test'
import {
    DEVICE_C_HEADERS,
    DEVICE_DIRECTORY,
    deviceNasmProbe,
    deviceProbe,
    generateDeviceFiles,
    type DeviceProbeEntry
} from '../../../scripts/sim-header/deviceHeaders.mjs'
import { ERRNO_CODES } from '../../../scripts/sim-header/deviceTable.mjs'
import { X86_SYSCALLS } from '#lib/languages/X86/generated/x86Syscalls.ts'
import { X86Emulator } from '#lib/languages/X86/X86Emulator.svelte.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources, ProjectFiles } from '#lib/projectFiles.ts'
import { X86_DEVICE_HEADERS } from '#lib/sourceCompilation/capabilities.ts'
import { compileSource, X86_SYSROOT_INCLUDE } from '#lib/sourceCompilation/compilerExplorer.ts'
import { generatedAssemblyPath } from '#lib/sourceCompilation/records.ts'
import {
    environmentFileName,
    environmentFilePath,
    environmentHeaders,
    environmentNasmIncludes,
    isEnvironmentHeaderPath,
    loadedEnvironmentFile,
    loadEnvironmentFiles
} from './environmentLibrary'
import { parseRuntimeSourcePath } from './runtimeLibrary'
import x86DeviceFiles from './x86DeviceFiles'

/**
 * x86's device headers and NASM include files ([ADR 0070](../../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)):
 * generated from one table and committed, uploaded with x86 compiles only, and checked against
 * Linux's own headers (decision 15 of the x86 devices plan) and against NASM.
 */

const generated = generateDeviceFiles(X86_SYSCALLS)
const scratch: string[] = []
afterAll(() => {
    for (const directory of scratch) rmSync(directory, { recursive: true, force: true })
})
function temporary() {
    const directory = mkdtempSync(join(tmpdir(), 'x86-devices-'))
    scratch.push(directory)
    return directory
}

function committedFiles(directory = DEVICE_DIRECTORY): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? committedFiles(join(directory, entry.name))
            : [relative(DEVICE_DIRECTORY, join(directory, entry.name)).split('\\').join('/')]
    )
}

describe('the committed device files', () => {
    it('are what the table generates', () => {
        expect(committedFiles().sort(), 'run node scripts/sim-header/generate.mjs').toEqual(
            Object.keys(generated).sort()
        )
        for (const [path, text] of Object.entries(generated))
            expect(readFileSync(join(DEVICE_DIRECTORY, path), 'utf8'), path).toBe(text)
    })

    it('reach the editor whole, in one module', () => {
        expect(x86DeviceFiles).toEqual(generated)
    })

    it('are offered to x86 C and C++ alone, the private header aside', () => {
        expect([...X86_DEVICE_HEADERS].sort()).toEqual(
            DEVICE_C_HEADERS.filter((path) => !path.startsWith('bits/') && path !== 'time.h').sort()
        )
    })

    it("match the Runtime library's <errno.h>, which every Target shares", () => {
        const header = readFileSync(join(runtimeRoot, 'include', 'errno.h'), 'utf8')
        const defined = Object.fromEntries(
            [...header.matchAll(/^#define (E\w+) (\w+)$/gm)].map((match) => [match[1], match[2]])
        )
        for (const code of ERRNO_CODES)
            expect(defined[code.name], code.name).toBe(String(code.value))
        //and the editor uploads that header as it is
        const uploaded = JSON.parse(
            readFileSync(join(runtimeRoot, 'generated/v1/include.json'), 'utf8')
        )['errno.h']
        expect(uploaded).toBe(header)
    })
})

describe('loading the device files', () => {
    it('gives x86 its headers and include files, and other Targets nothing', async () => {
        const files = await loadEnvironmentFiles('X86')
        expect(files).toEqual(generated)
        expect(Object.keys(environmentHeaders(files))).toContain('linux/fb.h')
        expect(Object.keys(environmentHeaders(files)).every((name) => name.endsWith('.h'))).toBe(
            true
        )
        expect(Object.keys(environmentNasmIncludes(files))).toContain('linux/fb.inc')
        expect(loadedEnvironmentFile('X86', 'linux/fb.h')).toBe(generated['linux/fb.h'])
        expect(loadedEnvironmentFile('X86', 'missing.h')).toBeUndefined()
        expect(await loadEnvironmentFiles('MIPS')).toEqual({})
        expect(loadedEnvironmentFile('MIPS', 'linux/fb.h')).toBeUndefined()
    })

    it('shows each read-only under @runtime/include/', () => {
        const path = environmentFilePath('linux/fb.h')
        expect(path).toBe('@runtime/include/linux/fb.h')
        expect(isEnvironmentHeaderPath(path)).toBe(true)
        expect(environmentFileName('@runtime/include/linux/input.inc')).toBe('linux/input.inc')
        expect(parseRuntimeSourcePath(path)).toEqual({ kind: 'environment', name: 'linux/fb.h' })
        for (const other of [
            '@runtime/include/../main.c',
            '@runtime/include/',
            '@runtime/v1/src/stdio/puts.c',
            'linux/fb.h'
        ])
            expect(isEnvironmentHeaderPath(other), other).toBe(false)
    })
})

const plain = (content: string) => ({ encoding: 'plain' as const, content })

function request(target: 'X86' | 'MIPS', source: string) {
    const files: ProjectFiles = { 'main.c': plain(source) }
    return {
        sourcePath: 'main.c',
        outputPath: generatedAssemblyPath('main.c', target),
        files,
        target,
        optimization: '0' as const
    }
}

describe('a compile', () => {
    it('uploads the device headers with x86 alone, searched before the shared ones', async () => {
        const answer = async () =>
            new Response(JSON.stringify({ code: 1, stderr: [{ text: 'stopped' }] }))
        const x86 = vi.fn(answer)
        await compileSource(request('X86', 'int main(void) { return 0; }\n'), undefined, x86).catch(
            () => undefined
        )
        const body = JSON.parse(
            String((x86.mock.calls[0] as unknown as [string, RequestInit])[1].body)
        )
        const names = (body.files as { filename: string }[]).map((file) => file.filename)
        expect(body.options.userArguments).toContain(
            `-nostdinc -isystem ${X86_SYSROOT_INCLUDE} -isystem sysroot/include `
        )
        for (const header of DEVICE_C_HEADERS)
            expect(names).toContain(`${X86_SYSROOT_INCLUDE}/${header}`)
        expect(names.some((name) => name.endsWith('.inc'))).toBe(false)

        const mips = vi.fn(answer)
        await compileSource(
            request('MIPS', 'int main(void) { return 0; }\n'),
            undefined,
            mips
        ).catch(() => undefined)
        const other = JSON.parse(
            String((mips.mock.calls[0] as unknown as [string, RequestInit])[1].body)
        )
        expect(other.options.userArguments).not.toContain(X86_SYSROOT_INCLUDE)
        expect(
            (other.files as { filename: string }[]).some((file) =>
                file.filename.startsWith(X86_SYSROOT_INCLUDE)
            )
        ).toBe(false)
    })

    it("maps a diagnostic in a device header onto it, and leaves the shared <time.h>'s alone", async () => {
        const stderr = [
            { text: 'In file included from project/main.c:1:' },
            { text: `${X86_SYSROOT_INCLUDE}/linux/fb.h:30:9: error: something` },
            { text: 'sysroot/include/time.h:3:1: error: another' }
        ]
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 1, stderr })))
        const error = await compileSource(
            request('X86', '#include <linux/fb.h>\nint main(void) { return 0; }\n'),
            undefined,
            fetcher
        ).catch((caught: unknown) => caught)
        const diagnostics = (error as { diagnostics: { file: string; lineIndex: number }[] })
            .diagnostics
        expect(diagnostics.map((item) => [item.file, item.lineIndex])).toEqual([
            ['@runtime/include/linux/fb.h', 29],
            ['main.c', 2]
        ])
    })
})

const gcc = spawnSync('gcc', ['--version']).status === 0
const UAPI = ['linux/fb.h', 'linux/input.h', 'linux/kd.h', 'linux/soundcard.h', 'sound/asound.h']
const uapi = UAPI.every((header) => existsSync(join('/usr/include', header)))
const hostLinux = (() => {
    if (!existsSync('/usr/include/linux/version.h')) return 0
    const match = /LINUX_VERSION_CODE (\d+)/.exec(
        readFileSync('/usr/include/linux/version.h', 'utf8')
    )
    return match ? Number(match[1]) : 0
})()
/** Linux 7.2, the guest's, as `LINUX_VERSION_CODE` counts. */
const LINUX_7_2 = (7 << 16) + (2 << 8)

/**
 * The values of C expressions as GCC compiles them for x86-64: one table of `long long`, read back
 * from the assembly, as `packages/runtime/abi/layout.c` is.
 */
function probe(
    includes: readonly string[],
    entries: readonly { expression: string }[],
    flags: readonly string[]
) {
    const directory = temporary()
    const source = [
        ...includes.map((header) => `#include <${header}>`),
        '#include <stddef.h>',
        'const long long probe_values[] = {',
        ...entries.map((entry) => `    (long long)(${entry.expression}),`),
        '};',
        ''
    ].join('\n')
    writeFileSync(join(directory, 'probe.c'), source)
    const assembly = execFileSync(
        'gcc',
        ['-S', '-O0', '-o', '-', ...flags, join(directory, 'probe.c')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
    const table = assembly.slice(assembly.indexOf('probe_values:'))
    return [...table.matchAll(/^\s*\.quad\s+(-?\d+)\s*$/gm)].map((match) => Number(match[1]))
}

/** Our headers as the editor compiles against them: x86's first, then the Runtime library's. */
const OURS = [
    '-nostdinc',
    '-isystem',
    join(process.cwd(), DEVICE_DIRECTORY),
    '-isystem',
    join(runtimeRoot, 'include')
]
const ourHeaders = [...DEVICE_C_HEADERS.filter((path) => !path.startsWith('bits/')), 'errno.h']

describe.skipIf(!gcc || !uapi)('the layouts, against the kernel and the C library', () => {
    const entries = deviceProbe(X86_SYSCALLS)

    it('are what the table says, as GCC compiles our headers, warning-free', () => {
        const ours = entries.filter((entry) => entry.c)
        const values = probe(ourHeaders, ours, ['-std=c17', '-Wall', '-Wextra', '-Werror', ...OURS])
        expect(values).toHaveLength(ours.length)
        const wrong = ours.flatMap((entry, index) =>
            values[index] === entry.value
                ? []
                : [`${entry.expression}: ${values[index]}, not ${entry.value}`]
        )
        expect(wrong).toEqual([])
    })

    it("are Linux's, as its UAPI headers and glibc's give them", () => {
        const linux = entries.filter((entry) => entry.linux)
        const values = probe(
            [
                'dirent.h',
                'errno.h',
                'fcntl.h',
                'poll.h',
                'signal.h',
                'termios.h',
                'time.h',
                'unistd.h',
                'sys/ioctl.h',
                'sys/mman.h',
                'sys/select.h',
                'sys/stat.h',
                'sys/syscall.h',
                'sys/time.h',
                'sys/types.h',
                'linux/fb.h',
                'linux/input.h',
                'linux/kd.h',
                'sys/soundcard.h',
                'sound/asound.h'
            ],
            linux,
            ['-D_GNU_SOURCE']
        )
        expect(values).toHaveLength(linux.length)
        const wrong = linux.flatMap((entry: DeviceProbeEntry, index) => {
            if (values[index] === entry.value) return []
            //a later kernel than the guest's changed it, which the table records
            if (entry.guest && hostLinux > LINUX_7_2 + 255) return []
            return [`${entry.expression}: Linux ${values[index]}, ours ${entry.value}`]
        })
        expect(wrong).toEqual([])
    })

    it('compile as C++ too', () => {
        const directory = temporary()
        writeFileSync(
            join(directory, 'probe.cpp'),
            `${ourHeaders.map((header) => `#include <${header}>`).join('\n')}\nint main() { return 0; }\n`
        )
        execFileSync(
            'g++',
            [
                '-fsyntax-only',
                '-std=c++17',
                '-nostdinc++',
                '-Wall',
                '-Wextra',
                '-Werror',
                ...OURS,
                join(directory, 'probe.cpp')
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] }
        )
    })
})

/**
 * What a header gives a program that includes it alone, as Linux's own headers do: a program that
 * builds here builds on Linux, and one that would not build there fails here too.
 */
const SNIPPETS: readonly [name: string, source: string][] = [
    ['errno after <unistd.h> alone', '#include <unistd.h>\nint f(void) { return errno; }'],
    [
        'EAGAIN after <linux/input.h> alone',
        '#include <linux/input.h>\nint f(void) { return EAGAIN; }'
    ],
    [
        'ioctl after <linux/fb.h> alone',
        '#include <linux/fb.h>\nint f(int fd) { return ioctl(fd, FBIOBLANK, 0); }'
    ],
    [
        'ioctl and select after <linux/input.h> alone',
        '#include <linux/input.h>\nint f(int fd) { fd_set s; FD_ZERO(&s); select(0, &s, 0, 0, 0); return ioctl(fd, EVIOCGVERSION, 0); }'
    ],
    [
        'a raw MIDI request after <sound/asound.h> alone',
        '#include <sound/asound.h>\nunsigned long f(void) { return SNDRV_RAWMIDI_IOCTL_PVERSION; }'
    ],
    [
        'malloc after <sound/asound.h> alone',
        '#include <sound/asound.h>\nvoid *f(void) { return malloc(1); }'
    ],
    [
        'gettimeofday after <sys/select.h> alone',
        '#include <sys/select.h>\nint f(struct timeval *t) { return gettimeofday(t, 0); }'
    ],
    [
        'clock_gettime after <sys/stat.h> alone',
        '#include <sys/stat.h>\nint f(struct timespec *t) { return clock_gettime(0, t); }'
    ],
    [
        'struct timespec after <sys/stat.h> alone',
        '#include <sys/stat.h>\nlong f(struct stat *s) { struct timespec t = s->st_mtim; return t.tv_nsec; }'
    ],
    [
        'the console ioctls after <linux/kd.h> alone',
        '#include <linux/kd.h>\nint f(int fd) { return ioctl(fd, KIOCSOUND, 0); }'
    ]
]

describe.skipIf(!gcc || !uapi)('a header included alone', () => {
    it.each(SNIPPETS)('builds %s here exactly when it does on Linux', (_name, source) => {
        const directory = temporary()
        writeFileSync(join(directory, 'snippet.c'), `${source}\n`)
        const builds = (flags: readonly string[]) =>
            spawnSync('gcc', ['-fsyntax-only', '-std=gnu17', ...flags, 'snippet.c'], {
                cwd: directory
            }).status === 0
        expect(builds(OURS)).toBe(builds([]))
    })
})

describe('the NASM include files', () => {
    it('assemble with NASM, every value as the table says', async () => {
        const includes = environmentNasmIncludes(generated)
        //a check that divides by zero, which NASM refuses, unless the value is the table's
        const checks = deviceNasmProbe(X86_SYSCALLS).map(
            (entry) => `    dd 1 / ((${entry.expression}) == ${entry.value}) ; ${entry.file}`
        )
        const program = [
            'bits 64',
            ...Object.keys(includes).map((path) => `%include "${path}"`),
            //a second time, which the guards make harmless
            '%include "linux/input.inc"',
            'section .rodata',
            ...checks,
            'section .text',
            'global _start',
            '_start:',
            '    mov eax, SYS_exit',
            '    xor edi, edi',
            '    syscall',
            ''
        ].join('\n')
        //found through the include path the Build gives NASM (decision 16)
        const sources = { entry: 'main.asm', files: { 'main.asm': plain(program) } }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
        } finally {
            emulator.dispose()
        }
    }, 60_000)
})

/**
 * Compiler Explorer played by the host's GCC: the request's files written out and compiled with its
 * own arguments, the assembly answered as Compiler Explorer answers it.
 */
async function hostCompiler(_url: unknown, init?: RequestInit) {
    const body = JSON.parse(String(init!.body)) as {
        source: string
        lang: string
        options: { userArguments: string }
        files: { filename: string; contents: string }[]
    }
    const directory = temporary()
    for (const file of body.files) {
        mkdirSync(dirname(join(directory, file.filename)), { recursive: true })
        writeFileSync(join(directory, file.filename), file.contents)
    }
    const input = body.lang === 'c++' ? 'example.cpp' : 'example.c'
    writeFileSync(join(directory, input), body.source)
    const run = spawnSync(
        'sh',
        [
            '-c',
            `${body.lang === 'c++' ? 'g++' : 'gcc'} -S -o - ${body.options.userArguments} ${input}`
        ],
        { cwd: directory, encoding: 'utf8' }
    )
    const lines = (text: string) =>
        text
            .split('\n')
            .filter(Boolean)
            .map((line) => ({ text: line }))
    return new Response(
        JSON.stringify({
            code: run.status,
            stdout: [],
            stderr: lines(run.stderr),
            asm: run.stdout.split('\n').map((text) => ({ text, source: null }))
        })
    )
}

const CALLS = `#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <linux/fb.h>
#include <linux/input.h>
#include <sound/asound.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/select.h>
#include <sys/soundcard.h>
#include <sys/time.h>

/* What a call answered and whether errno is then the one expected, read after the call. */
static void report(const char *name, long result, int expected) {
    int matches = errno == expected;
    printf("%s %ld %d\\n", name, result, matches);
}

static volatile sig_atomic_t caught;

static void on_signal(int sig) {
    caught = sig;
}

int main(void) {
    report("open", open("/no/such/file", O_RDONLY), ENOENT);
    report("close", close(99), EBADF);
    errno = 0;
    report("fsync", fsync(99), EBADF);
    struct termios modes;
    int got = tcgetattr(0, &modes);
    printf("tcgetattr %d %d\\n", got, (modes.c_lflag & ICANON) != 0);
    struct termios raw = modes;
    cfmakeraw(&raw);
    printf("cfmakeraw %d %d\\n", (raw.c_lflag & (ICANON | ECHO)) == 0, raw.c_cc[VMIN]);
    report("tcsetattr", tcsetattr(0, 7, &modes), EINVAL);
    printf("ioctl %d\\n", ioctl(1, 0x12345678));
    struct timespec now;
    printf("clock_gettime %d\\n", clock_gettime(CLOCK_MONOTONIC, &now));
    struct timespec pause = { 0, 1000000 };
    printf("nanosleep %d usleep %d sleep %u\\n", nanosleep(&pause, NULL), usleep(1000), sleep(0));
    struct timeval tv;
    printf("gettimeofday %d\\n", gettimeofday(&tv, NULL));
    char *memory = (char *)mmap(NULL, 8192, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    memory[4096] = 42;
    printf("mmap %d %d\\n", memory != MAP_FAILED, memory[4096]);
    printf("munmap %d\\n", munmap(memory, 8192));
    printf("fcntl %d\\n", fcntl(1, F_GETFL) >= 0);
    printf("poll %d\\n", poll(NULL, 0, 1));
    struct timeval wait = { 0, 1000 };
    printf("select %d\\n", select(0, NULL, NULL, NULL, &wait));
    printf("write %ld\\n", (long)write(1, "written\\n", 8));
    printf("sizes %d %d %d\\n", (int)sizeof(struct input_event), (int)sizeof(struct fb_var_screeninfo), SNDCTL_DSP_SPEED == 0xC0045002);
    int tty = isatty(0), file = isatty(99);
    printf("isatty %d %d %d\\n", tty, file, errno == EBADF);
    struct termios full;
    memset(&full, 0x55, sizeof full);
    tcgetattr(0, &full);
    printf("termios tail %d %d %d\\n", full.c_cc[19] == 0 && full.c_cc[NCCS - 1] == 0, full.c_ispeed == (full.c_cflag & (CBAUD | CBAUDEX)), full.c_ospeed == full.c_ispeed);
    printf("tcflush %d tcdrain %d\\n", tcflush(0, TCIFLUSH), tcdrain(1));
    struct stat st;
    got = stat("/dev/fb0", &st);
    printf("stat %d %d %lu\\n", got, S_ISCHR(st.st_mode), (unsigned long)st.st_rdev);
    got = fstat(0, &st);
    printf("fstat %d %d %lu\\n", got, S_ISCHR(st.st_mode), (unsigned long)st.st_rdev);
    DIR *dir = opendir("/dev/input");
    int events = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)))
        if (strncmp(entry->d_name, "event", 5) == 0 && entry->d_type == DT_CHR) events++;
    rewinddir(dir);
    int again = 0;
    while (readdir(dir)) again++;
    printf("readdir %d %d %d\\n", events, again > events, closedir(dir));
    report("opendir", opendir("/no/such") == NULL ? -1 : 0, ENOENT);
    printf("signal %d\\n", signal(SIGUSR1, on_signal) == SIG_DFL);
    printf("raise %d", raise(SIGUSR1));
    printf(" %d\\n", caught);
    caught = 0;
    printf("kill %d", kill(getpid(), SIGUSR1));
    printf(" %d\\n", caught);
    struct sigaction old;
    sigaction(SIGUSR1, NULL, &old);
    printf("sigaction %d %d\\n", old.sa_handler == on_signal, (old.sa_flags & SA_RESTART) != 0);
    report("sigaction", sigaction(SIGKILL, &old, NULL), EINVAL);
    return 0;
}
`

const CALLS_OUTPUT = [
    'open -1 1',
    'close -1 1',
    'fsync -1 1',
    'tcgetattr 0 1',
    'cfmakeraw 1 1',
    'tcsetattr -1 1',
    'ioctl -1',
    'clock_gettime 0',
    'nanosleep 0 usleep 0 sleep 0',
    'gettimeofday 0',
    'mmap 1 42',
    'munmap 0',
    'fcntl 1',
    'poll 0',
    'select 0',
    'written',
    'write 8',
    'sizes 24 160 1',
    'isatty 1 0 1',
    'termios tail 1 1 1',
    'tcflush 0 tcdrain 0',
    'stat 0 1 7424',
    'fstat 0 1 1088',
    'readdir 5 1 0',
    'opendir -1 1',
    'signal 1',
    'raise 0 10',
    'kill 0 10',
    'sigaction 1 1',
    'sigaction -1 1',
    ''
].join('\n')

describe.skipIf(!gcc)('a C program making the POSIX calls', () => {
    it.each(['0', '2'] as const)(
        'compiles at -O%s through the editor and runs on x86',
        async (optimization) => {
            const source = request('X86', CALLS)
            const compiled = await compileSource(
                { ...source, optimization },
                undefined,
                hostCompiler
            )
            expect(compiled.diagnostics.filter((item) => item.severity === 'error')).toEqual([])
            //the system calls are the headers' own, inlined or local, and map into them
            const assembly = compiled.assembly.split('\n')
            const mapped = new Set(
                assembly.flatMap((line, index) =>
                    /^\s*syscall\b/.test(line) ? [compiled.map.lines[index]?.path] : []
                )
            )
            expect([...mapped]).toEqual(
                expect.arrayContaining([
                    '@runtime/include/unistd.h',
                    '@runtime/include/sys/ioctl.h'
                ])
            )
            expect(Object.keys(compiled.record.inputs)).toEqual(['main.c'])

            const sources: BuildSources = {
                entry: source.outputPath,
                entrySymbol: '_start',
                runtimeAbi: 'v1',
                files: { ...source.files, [source.outputPath]: plain(compiled.assembly) }
            }
            const testcase: Testcase = {
                input: [],
                expectedOutput: CALLS_OUTPUT,
                startingRegisters: {},
                expectedRegisters: {},
                startingMemory: [],
                expectedMemory: []
            }
            const emulator = await X86Emulator(sources, { automaticChecking: false })
            try {
                const [outcome] = await emulator.test(sources, [testcase], 2_000_000)
                expect(emulator.errors).toEqual([])
                expect(outcome?.errors ?? []).toEqual([])
                expect(outcome?.passed).toBe(true)
            } finally {
                emulator.dispose()
            }
        },
        60_000
    )
})
