/**
 * NASM's include files under the include path ([x86 devices plan](../../../../../../docs/design/x86-devices-plan.md),
 * decision 16; [ADR 0070](../../../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)):
 * a Build stages the generated `.inc` files at `@runtime/include/`, the read-only paths the editor
 * shows them at, and gives NASM that directory, so `%include "linux/fb.inc"` builds, a mistake NASM
 * finds inside one is shown on it, and the File statuses count it as found.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { normalizeBuildInput, type ProjectFiles } from '#lib/projectFiles.ts'
import { analyzeX86Project } from '#lib/languages/service/adapters/x86Adapter.ts'
import { environmentFilePath } from '#lib/sourceRuntime/environmentLibrary.ts'
import {
    loadedX86Includes,
    loadX86Includes,
    withX86Includes,
    X86_INCLUDE_PATH,
    x86ReachableFiles,
    toX86Project
} from './x86Project'
import { X86Emulator } from './X86Emulator.svelte'

const text = (content: string) => ({ encoding: 'plain' as const, content })
const sources = (files: ProjectFiles, entry = 'main.asm') => normalizeBuildInput({ entry, files })

/** Maps `/dev/fb0` through the include files' names, and writes two pixels into it. */
const DRAW = [
    'bits 64',
    'default rel',
    '%include "sys/syscall.inc"',
    '%include "fcntl.inc"',
    '%include "sys/mman.inc"',
    '%include "linux/fb.inc"',
    'global _start',
    'section .bss',
    'fix: resb fb_fix_screeninfo_size',
    'section .data',
    "fb: db '/dev/fb0', 0",
    'section .text',
    '_start:',
    '    mov eax, SYS_open',
    '    lea rdi, [fb]',
    '    mov esi, O_RDWR',
    '    xor edx, edx',
    '    syscall',
    '    mov r12, rax',
    '    mov eax, SYS_ioctl',
    '    mov rdi, r12',
    '    mov esi, FBIOGET_FSCREENINFO',
    '    lea rdx, [fix]',
    '    syscall',
    '    mov eax, SYS_mmap',
    '    xor edi, edi',
    '    mov esi, [fix + fb_fix_screeninfo.smem_len]',
    '    mov edx, PROT_READ | PROT_WRITE',
    '    mov r10d, MAP_SHARED',
    '    mov r8, r12',
    '    xor r9d, r9d',
    '    syscall',
    '    mov dword [rax + 2*4], 0x00ff8000',
    '    mov ecx, [fix + fb_fix_screeninfo.line_length]',
    '    mov dword [rax + rcx + 1*4], 0x000000ff',
    '    nop ; drawn',
    '    mov eax, SYS_exit',
    '    xor edi, edi',
    '    syscall'
].join('\n')

type Emulator = Awaited<ReturnType<typeof X86Emulator>>
const emulators: Emulator[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

/** The Screen's pixel at `x`, `y` as `0xRRGGBB`. */
function pixel(emulator: Emulator, x: number, y: number): number {
    const screen = emulator.peripherals.screen
    const index = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]
}

describe('an x86 Build with include files', () => {
    it('maps the framebuffer through linux/fb.inc and sys/mman.inc, and the Screen shows it', async () => {
        const input = sources({ 'main.asm': text(DRAW) })
        const emulator = await X86Emulator(input, {
            automaticChecking: false,
            display: { width: 64, height: 48 }
        })
        emulators.push(emulator)
        await emulator.compile(100, input)
        expect(emulator.compilerDiagnostics).toEqual([])
        emulator.toggleBreakpoint(DRAW.split('\n').indexOf('    nop ; drawn'))
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(pixel(emulator, 2, 0)).toBe(0xff8000)
        expect(pixel(emulator, 1, 1)).toBe(0x0000ff)
        expect(pixel(emulator, 0, 0)).toBe(0)
        await emulator.run(1000)
        expect(emulator.terminated).toBe(true)
    })

    it('shows a mistake NASM finds inside an include file on that file, read-only', async () => {
        //the program's own label takes the name of a structure linux/fb.inc defines
        const program = [
            'global _start',
            'section .data',
            'fb_var_screeninfo: db 0',
            '%include "linux/fb.inc"',
            'section .text',
            '_start: ret'
        ].join('\n')
        const input = sources({ 'main.asm': text(program) })
        const emulator = await X86Emulator(input, { automaticChecking: false })
        emulators.push(emulator)
        await expect(emulator.compile(100, input)).rejects.toThrow('inconsistently redefined')
        const path = environmentFilePath('linux/fb.inc')
        const line = loadedX86Includes()!
            ['linux/fb.inc'].split('\n')
            .indexOf('struc fb_var_screeninfo')
        expect(emulator.compilerDiagnostics).toEqual([
            expect.objectContaining({
                severity: 'error',
                file: path,
                lineIndex: line,
                message: "label `fb_var_screeninfo' inconsistently redefined",
                //the name the message quotes, found in the include file's own line
                column: 'struc '.length + 1,
                endColumn: 'struc fb_var_screeninfo'.length + 1
            })
        ])

        //the live check says the same, and the File that wrote the include is assembled
        const snapshot = await analyzeX86Project(input, 'x86-include-error', 1)
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                severity: 'error',
                location: expect.objectContaining({
                    path,
                    range: expect.objectContaining({
                        start: expect.objectContaining({ line })
                    })
                })
            })
        ])
        expect(snapshot.fileStatus).toEqual({ 'main.asm': 'assembled' })
    })

    it('stages the include files only when a File could read one', async () => {
        await loadX86Includes()
        const plain = sources({ 'main.asm': text('global _start\n_start: ret') })
        expect(withX86Includes(toX86Project(plain), plain)).toEqual(toX86Project(plain))

        const including = sources({ 'main.asm': text('%include "linux/input.inc"') })
        const project = withX86Includes(toX86Project(including), including)
        expect(project.includePaths).toEqual([X86_INCLUDE_PATH])
        expect(project.files[environmentFilePath('linux/input.inc')]).toBe(
            loadedX86Includes()!['linux/input.inc']
        )
        //and only the NASM ones: a C header is never `%include`d
        expect(Object.keys(project.files).filter((path) => path.endsWith('.h'))).toEqual([])
    })
})

describe('x86 File reachability through the include path', () => {
    it('finds an include file of the include path, and still follows the Project Files', async () => {
        await loadX86Includes()
        const input = sources({
            'main.asm': text(
                'global _start\n%include "linux/fb.inc"\n%include "parts/draw.inc"\n_start: ret'
            ),
            'parts/draw.inc': text('%include "sys/mman.inc" ; and the Project File below\nnop'),
            'unused.inc': text('nop')
        })
        expect(x86ReachableFiles(input)).toEqual(new Set(['main.asm', 'parts/draw.inc']))

        const snapshot = await analyzeX86Project(input, 'x86-include-status', 1)
        expect(snapshot.diagnostics).toEqual([])
        expect(snapshot.fileStatus).toEqual({
            'main.asm': 'assembled',
            'parts/draw.inc': 'assembled',
            'unused.inc': 'not-reachable'
        })
    })

    it('lets a File of the Project stand in for an include file, as NASM searches it first', async () => {
        await loadX86Includes()
        const input = sources({
            'main.asm': text('%include "linux/fb.inc"'),
            'linux/fb.inc': text('nop')
        })
        expect(x86ReachableFiles(input)).toEqual(new Set(['main.asm', 'linux/fb.inc']))
    })

    it('leaves reachability unknown for an include file nothing has', async () => {
        await loadX86Includes()
        for (const written of ['linux/nothing.inc', '/linux/fb.inc', 'linux/fb.h'])
            expect(
                x86ReachableFiles(sources({ 'main.asm': text(`%include "${written}"`) })),
                written
            ).toBeUndefined()
    })
})
