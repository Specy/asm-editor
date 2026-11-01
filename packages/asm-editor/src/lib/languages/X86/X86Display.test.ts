/**
 * x86's Display configuration on the Emulator (decision 13 of
 * [the plan](../../../../../../docs/design/x86-devices-plan.md)): the Screen takes the framebuffer's
 * size, the user's choice or what the Entry file's `@screen` comment asks for, and keeps it through
 * the clear path a Build and Stop go through.
 */
import { describe, expect, it } from 'vite-plus/test'
import { X86Emulator } from './X86Emulator.svelte'

const EXIT = [
    'global _start',
    'section .text',
    '_start:',
    '    mov rax, 60',
    '    xor rdi, rdi',
    '    syscall'
]

function sources(content: string) {
    return { entry: 'main.asm', files: { 'main.asm': { encoding: 'plain' as const, content } } }
}

describe('the x86 Display configuration', () => {
    it("starts at the Program's display, 320 by 240 by default, and keeps it through a clear", async () => {
        const program = sources(EXIT.join('\n'))
        const emulator = await X86Emulator(program, { automaticChecking: false })
        try {
            const screen = emulator.peripherals.screen
            expect([screen.width, screen.height]).toEqual([320, 240])
            expect(emulator.getDisplay?.()).toEqual({
                display: { width: 320, height: 240 },
                origin: 'user'
            })
            emulator.setDisplay?.({ width: 642, height: 480 })
            expect([screen.width, screen.height]).toEqual([640, 480])
            await emulator.compile(20, program)
            expect(emulator.compilerErrors).toEqual([])
            expect([screen.width, screen.height]).toEqual([640, 480])
            emulator.clear()
            expect([screen.width, screen.height]).toEqual([640, 480])
            expect(emulator.getDisplay?.()?.origin).toBe('user')
        } finally {
            emulator.dispose()
        }
    })

    it("reads the Entry file's @screen comment at Build, with its warnings on that File", async () => {
        const program = sources(['; @screen width=322 height=200', ...EXIT].join('\n'))
        const emulator = await X86Emulator(program, { automaticChecking: false })
        try {
            await emulator.compile(20, program)
            expect(emulator.compilerErrors).toEqual([])
            expect(emulator.getDisplay?.()).toEqual({
                display: { width: 320, height: 200 },
                origin: 'directive'
            })
            const screen = emulator.peripherals.screen
            expect([screen.width, screen.height]).toEqual([320, 200])
            expect(emulator.compilerDiagnostics).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    file: 'main.asm',
                    lineIndex: 0,
                    message: expect.stringContaining('must be a multiple of 8')
                })
            ])
        } finally {
            emulator.dispose()
        }
    })

    it('reads a compiled Entry from its C source, where the comment is', async () => {
        const program = {
            ...sources(EXIT.join('\n')),
            entrySource: 'main.c',
            files: {
                ...sources(EXIT.join('\n')).files,
                'main.c': {
                    encoding: 'plain' as const,
                    content: '/* @screen width=640 height=480 */\nint main(void) { return 0; }\n'
                }
            }
        }
        const emulator = await X86Emulator(program, { automaticChecking: false })
        try {
            await emulator.compile(20, program)
            expect(emulator.getDisplay?.()).toEqual({
                display: { width: 640, height: 480 },
                origin: 'directive'
            })
        } finally {
            emulator.dispose()
        }
    })
})
