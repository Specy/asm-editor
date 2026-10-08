#!/usr/bin/env node
/**
 * Captures the Environment library's compile fixtures, `src/lib/sourceRuntime/fixtures/sim`: the
 * programs below compiled through Compiler Explorer as the editor requests them, against the
 * Runtime library's headers and the committed `<sim.h>` of each Target, by GCC and Clang at `-O0`
 * and `-O2`. x86's go to `fixtures/sim/x86`: GCC 14.2 alone, under its translation profile's flags,
 * against the freestanding headers and `<sim.h>`, in C and C++. The editor's tests run them on the
 * Cores without network access.
 *
 *   node scripts/sim-header/capture-fixtures.mjs [--only <text in a fixture's name>] [--raw <directory>]
 *
 * Kept in step with `createCompilerRequest` in `src/lib/sourceCompilation/compilerExplorer.ts`: each
 * fixture records the compiler and arguments it asked for, and the test compares them with the
 * editor's own request. The debug sections, which the editor drops, are left out of the stored
 * response, and so are the fields of a line it never reads. x86's translator reads every line's
 * text, its `.file` and `.loc` included, and nothing else, so an x86 fixture keeps exactly that.
 */
import {
    compilerPreset,
    compilerCodeFlags,
    compilerLanguageFlags
} from '../../src/lib/sourceCompilation/compilerContract.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as prettier from 'prettier'
import { GCC_INTEL_V1 } from '@specy/x86/compiler-output'
import { SIM_HEADER_DIRECTORY } from './simHeader.mjs'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const output = join(repository, 'src', 'lib', 'sourceRuntime', 'fixtures', 'sim')
const runtimeHeaders = JSON.parse(
    readFileSync(join(repository, 'src/lib/sourceRuntime/generated/v1/include.json'), 'utf8')
)

const TARGETS = Object.fromEntries(
    [
        ['MIPS', 'mips'],
        ['RISC-V', 'riscv32'],
        ['RISC-V-64', 'riscv64'],
        ['X86', 'x86_64']
    ].map(([target, header]) => [
        target,
        {
            header,
            compilers: Object.fromEntries(
                (target === 'X86' ? ['gcc'] : ['gcc', 'clang']).map((compiler) => [
                    compiler,
                    compilerPreset(target, 'c', compiler, GCC_INTEL_V1).id
                ])
            ),
            cpp: { gcc: compilerPreset(target, 'cpp', 'gcc', GCC_INTEL_V1).id }
        }
    ])
)
const MARS_TARGETS = ['MIPS', 'RISC-V', 'RISC-V-64']

/** The Runtime library's headers an x86 program may include: `X86_HEADERS` in compilerExplorer.ts. */
const X86_HEADERS = [
    'stddef.h',
    'stdint.h',
    'stdbool.h',
    'stdarg.h',
    'limits.h',
    'float.h',
    'iso646.h',
    'stdnoreturn.h',
    'cstddef',
    'cstdint',
    'climits',
    'cfloat',
    'cstdarg',
    'new'
]

function userArguments(target, compiler, optimization, language) {
    const sourcePath = language === 'cpp' ? 'src/main.cpp' : 'src/main.c'
    const projectFlags = `-iquote 'project/src' -iquote project -include 'project/${sourcePath}'`
    const profile = target === 'X86' ? GCC_INTEL_V1 : undefined
    const preset = compilerPreset(target, language, compiler, profile)
    return `${compilerCodeFlags(compiler, optimization, false, profile)} -nostdinc -isystem sysroot/include ${preset.architecture} ${projectFlags} ${compilerLanguageFlags(language, profile)}`
}

/**
 * Every service a Testcase can run unattended: the reads take their answers from its input, and the
 * message dialogs, which wait for someone to dismiss them, and `sim_exit` are only compiled.
 */
const SERVICES = `#include <sim.h>

static char line[16];
static char text[16];
static char contents[16];

static void show(const char *label, int value) {
    sim_print_string(label);
    sim_print_int(value);
    sim_print_char('\\n');
}

int main(void) {
#if defined(__riscv)
    char cwd[2];
    sim_get_cwd(cwd, sizeof cwd);
    sim_print_string(cwd);
    sim_print_char('\\n');
#endif
    sim_print_string("print\\n");
    sim_print_int(-42);
    sim_print_char('\\n');
    sim_print_unsigned(4294967295u);
    sim_print_char('\\n');
    sim_print_hex(255);
    sim_print_char('\\n');
    sim_print_binary(5);
    sim_print_char('\\n');
    sim_print_float(1.5f);
    sim_print_char('\\n');
    sim_print_double(2.25);
    sim_print_char('\\n');

    int number = sim_read_int();
    float single = sim_read_float();
    double precise = sim_read_double();
    sim_read_string(line, sizeof line);
    int character = sim_read_char();
    show("int ", number * 6);
    sim_print_float(single * 3);
    sim_print_char('\\n');
    sim_print_double(precise * 9);
    sim_print_char('\\n');
    sim_print_string(line);
    sim_print_char(character);
    sim_print_char('\\n');

    int *heap = (int *)sim_sbrk(16);
    int *next = (int *)sim_sbrk(16);
    heap[3] = 7;
    show("sbrk ", (int)(next - heap) + heap[3]);

    long long before = sim_time();
    sim_sleep(25);
    long long after = sim_time();
    show("slept ", (int)(after - before));

    sim_random_seed(1, 42);
    int ranged = sim_random_int_range(1, 10);
    float fraction = sim_random_float(1);
    double share = sim_random_double(1);
    int any = sim_random_int(1);
    (void)any;
    show("random ", ranged >= 0 && ranged < 10 && fraction >= 0.0f && fraction < 1.0f && share >= 0.0 && share < 1.0);

    int fd = sim_open("notes.txt", 1, 0);
    int written = sim_write(fd, "data", 4);
    sim_close(fd);
    fd = sim_open("notes.txt", 0, 0);
    int got = sim_read(fd, contents, 15);
    int position = sim_lseek(fd, 1, 0);
    int more = sim_read(fd, contents + got, 15 - got);
    sim_close(fd);
    show("descriptor ", fd >= 3);
    show("written ", written);
    show("read ", got * 10 + more);
    show("seek ", position);
    sim_print_string(contents);
    sim_print_char('\\n');

    int status = -9;
    show("confirm ", sim_confirm_dialog("Go on?"));
    show("dialog int ", sim_input_dialog_int("A number?", &status) * 10 + status);
    sim_print_float(sim_input_dialog_float("A float?", &status));
    show(" ", status);
    sim_print_double(sim_input_dialog_double("A double?", &status));
    show(" ", status);
    show("dialog string ", sim_input_dialog_string("Text?", text, sizeof text));
    sim_print_string(text);
    sim_print_char('\\n');

    show("display ", sim_display_ready());
    sim_display_write('!');
    sim_display_write('\\n');
    while (!sim_keyboard_ready()) sim_sleep(1);
    show("key ", sim_keyboard_read());

    if (number == 12345) {
        sim_message_dialog("Error", 0);
        sim_message_dialog_int("Int ", 1);
        sim_message_dialog_float("Float ", 1.5f);
        sim_message_dialog_double("Double ", 2.5);
        sim_message_dialog_string("String ", "text");
        sim_exit();
    }
    sim_exit2(3);
}
`

/** A display of 256 by 128 pixels in units of 2, so a grid of 128 by 64 words. */
const SCREEN = `#include <sim.h>

SIM_SCREEN(screen, 256, 128, 2);

int main(void) {
    screen[5 * (256 / 2) + 7] = sim_rgb(255, 128, 0);
    sim_exit();
}
`

/** 512 by 256 words, 512 KiB: grows past the reference heap base. */
const SCREEN_LARGE = SCREEN.replace('256, 128, 2', '512, 256, 1').replace('(256 / 2)', '512')

/** 1024 by 1024 words, 4 MiB: past the GNU-profile static-data cap. */
const SCREEN_TOO_LARGE = `#include <sim.h>

SIM_SCREEN(screen, 1024, 1024, 1);

int main(void) {
    screen[0] = sim_rgb(255, 255, 255);
    return 0;
}
`

/**
 * A function of the program's own named like one of `<sim.h>`'s, defined before the include: the
 * compilers report the header's definition as the redefinition, so the error is located in it.
 */
const HEADER_DIAGNOSTIC = `static void sim_print_int(int value) {
    (void)value;
}
#include <sim.h>

int main(void) {
    sim_print_int(7);
    return 0;
}
`

/**
 * x86's Linux system calls as a C or C++ program makes them: reading a line, writing, the process
 * id, a clock, a failure's negative error number and the exit status, which is the length read.
 */
const LINUX_CALLS = `#include <sim.h>

/* A string literal's bytes, without the NUL that ends it. */
#define PRINT(text) sim_write(1, text, sizeof(text) - 1)

static char line[32];

/* A number in decimal, with its sign. */
static void print_number(long value) {
    char digits[24];
    int at = (int)sizeof digits;
    unsigned long magnitude = value < 0 ? 0ul - (unsigned long)value : (unsigned long)value;
    do {
        digits[--at] = (char)('0' + magnitude % 10);
        magnitude /= 10;
    } while (magnitude != 0);
    if (value < 0) digits[--at] = '-';
    sim_write(1, digits + at, (long)sizeof digits - at);
}

int main(void) {
    PRINT("name? ");
    long length = sim_read(0, line, sizeof line);
    PRINT("hello ");
    sim_write(1, line, length);

    if (sim_getpid() > 0) PRINT("pid positive\\n");
    else PRINT("pid missing\\n");

    long now[2]; /* a struct timespec: seconds, then nanoseconds */
    PRINT("clock ");
    print_number(sim_clock_gettime(1 /* CLOCK_MONOTONIC */, now));
    if (now[1] >= 0 && now[1] < 1000000000) PRINT(" ok\\n");
    else PRINT(" out of range\\n");

    /* the kernel's own result: -9, EBADF, for a descriptor that is not open */
    PRINT("bad descriptor ");
    print_number(sim_write(99, line, 1));
    PRINT("\\n");

    sim_exit_group(length);
}
`

/** A call the x86 Core compiles out, so `<sim.h>` declares no function for it. */
const COMPILED_OUT = `#include <sim.h>

int main(void) {
    long child = sim_fork();
    return child < 0;
}
`

const EVERY = {
    targets: MARS_TARGETS,
    compilers: ['gcc', 'clang'],
    optimizations: ['0', '2']
}
/** x86 compiles with GCC alone, C and C++ alike. */
const X86 = { targets: ['X86'], compilers: ['gcc'], languages: ['c', 'cpp'] }
const PROGRAMS = {
    services: { source: SERVICES, ...EVERY },
    screen: { source: SCREEN, ...EVERY },
    'screen-large': { source: SCREEN_LARGE, ...EVERY },
    'screen-too-large': { source: SCREEN_TOO_LARGE, ...EVERY, optimizations: ['0'] },
    'header-diagnostic': {
        source: HEADER_DIAGNOSTIC,
        ...EVERY,
        targets: ['MIPS'],
        optimizations: ['0']
    },
    'linux-calls': { source: LINUX_CALLS, ...X86, optimizations: ['0', '2'] },
    'compiled-out': { source: COMPILED_OUT, ...X86, optimizations: ['0'] }
}
/** The programs that must fail to compile, and say why. */
const FAILING = new Set(['screen-too-large', 'header-diagnostic', 'compiled-out'])

const DEBUG_SECTION = /^\.(?:debug|zdebug|mdebug|note|comment|eh_frame)/
/** Labels GCC's MIPS output defines only for the debug sections. */
const MIPS_DEBUG_LABEL = /^\s*(?:\$L|\.L)(?:FB|FE|BB|BE|VL|text|etext|debug)\w*\s*(?::|=)/

/**
 * The response's lines without those `prepareAssembly` drops before reading anything else: the
 * contents of a debug section (the directives that open and close one stay), `.loc`, `.cfi_*` and
 * `.file`, MIPS debug labels and blank lines. Comments stay, `#APP` markers and `@screen` lines
 * among them. Each line is `[text]`, or `[text, file, line]` with the location Compiler Explorer
 * gave it, and `true` after them for the main source.
 */
function storedLines(asm, target) {
    if (target === 'X86') return asm.map((line) => [line.text])
    const kept = []
    let debug = false
    for (const line of asm) {
        const code = line.text
        const section = /^\s*\.section\s+(?:"([^"]+)"|([^\s,]+))/.exec(code)?.slice(1).find(Boolean)
        const previous = /^\s*\.previous\b/.test(code)
        const switches =
            !!section || previous || /^\s*\.(?:text|data|bss|sdata|sbss|rodata|rdata)\b/.test(code)
        if (section) debug = DEBUG_SECTION.test(section)
        else if (switches && !previous) debug = false
        if (debug && !switches) continue
        if (previous) debug = false
        if (
            /^\s*\.(?:file|loc|cfi_\w+|ident)\b/.test(code) ||
            (target === 'MIPS' && MIPS_DEBUG_LABEL.test(code)) ||
            !code.trim()
        )
            continue
        const source = line.source
        kept.push(
            source
                ? [
                      code,
                      source.file ?? null,
                      source.line ?? null,
                      ...(source.mainsource ? [true] : [])
                  ]
                : [code]
        )
    }
    return kept
}

const option = (name) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined
const only = option('--only') ?? ''
//the whole response as Compiler Explorer sent it, for checking what the stored lines leave out
const raw = option('--raw')
let lastRequest = 0
for (const [program, settings] of Object.entries(PROGRAMS)) {
    for (const target of settings.targets) {
        const x86 = target === 'X86'
        const header = readFileSync(
            join(repository, SIM_HEADER_DIRECTORY, `${TARGETS[target].header}.h`),
            'utf8'
        )
        //an x86 program gets only the library's freestanding headers, beside `<sim.h>`
        const sysroot = Object.entries(runtimeHeaders).filter(
            ([path]) => !x86 || X86_HEADERS.includes(path)
        )
        const directory = x86 ? join(output, 'x86') : output
        mkdirSync(directory, { recursive: true })
        for (const compiler of settings.compilers) {
            for (const optimization of settings.optimizations) {
                for (const language of settings.languages ?? ['c']) {
                    const cpp = language === 'cpp'
                    const name = `${program}-${target.toLowerCase()}-${compiler}${cpp ? '-cpp' : ''}-O${optimization}`
                    if (only && !name.includes(only)) continue
                    const fixture = {
                        program,
                        target,
                        compiler,
                        optimization,
                        sourcePath: cpp ? 'src/main.cpp' : 'src/main.c',
                        source: settings.source,
                        compilerId: (cpp ? TARGETS[target].cpp : TARGETS[target].compilers)[
                            compiler
                        ],
                        userArguments: userArguments(target, compiler, optimization, language)
                    }
                    await capture(name, fixture, sysroot, header, directory)
                }
            }
        }
    }
}

/** One compile, stored in `directory` as `<name>.json`. */
async function capture(name, fixture, sysroot, header, directory) {
    const body = {
        source: '/* The program is uploaded at its Project path and read through -include. */\n',
        lang: fixture.sourcePath.endsWith('.cpp') ? 'c++' : 'c',
        options: {
            userArguments: fixture.userArguments,
            filters: {
                binary: false,
                execute: false,
                labels: false,
                directives: false,
                commentOnly: false,
                trim: false,
                demangle: false,
                libraryCode: false
            }
        },
        files: [
            {
                filename: `project/${fixture.sourcePath}`,
                contents: `#line 1 ${JSON.stringify(fixture.sourcePath)}\n${fixture.source}`
            },
            ...sysroot.map(([path, contents]) => ({
                filename: `sysroot/include/${path}`,
                contents
            })),
            { filename: 'sysroot/include/sim.h', contents: header }
        ]
    }
    let response
    for (let attempt = 0; ; attempt++) {
        //one request at a time, a little apart: the service is shared and free
        const wait = lastRequest + 400 - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
        lastRequest = Date.now()
        const reply = await fetch(
            `https://godbolt.org/api/compiler/${fixture.compilerId}/compile`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body)
            }
        )
        if ((reply.status === 429 || reply.status >= 500) && attempt < 6) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt))
            continue
        }
        if (!reply.ok) throw new Error(`${name}: HTTP ${reply.status}`)
        response = await reply.json()
        break
    }
    const failing = FAILING.has(fixture.program)
    if ((response.code !== 0) !== failing) {
        const messages = (response.stderr ?? []).map((line) => line.text).join('\n')
        throw new Error(`${name} ${failing ? 'compiles' : 'does not compile'}:\n${messages}`)
    }
    fixture.captured = new Date().toISOString().slice(0, 10)
    fixture.response = {
        code: response.code,
        stderr: response.stderr ?? [],
        lines: storedLines(response.asm ?? [], fixture.target)
    }
    const path = join(directory, `${name}.json`)
    const options = { ...(await prettier.resolveConfig(path)), filepath: path }
    writeFileSync(path, await prettier.format(JSON.stringify(fixture), options))
    if (raw) writeFileSync(join(raw, `${name}.json`), JSON.stringify(response))
    console.log(`captured ${name}`)
}
