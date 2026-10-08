import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createX86Emulator } from '@specy/x86'
import {
    blinkRoot,
    parseBlinkSyscalls,
    readBlinkSyscalls
} from '../../../../scripts/x86-docs/sources.mjs'
import { X86_SYSCALLS } from './generated/x86Syscalls'

describe('the built Core syscall authority', () => {
    it('uses source signatures only for labels, preserving exported names, arities and membership', () => {
        const calls = parseBlinkSyscalls(
            {
                syscall:
                    '#ifdef SOMETHING_UNKNOWN\nSYSCALL(3, 0x011, "pread", SysPread, STRACE_READ);\n#endif\nSYSCALL(0, 0x039, "fork", SysFork, STRACE_0);',
                strace: '#define STRACE_READ BLOCKY SSIZE_ FD O_BUF BUFSZ UN UN UN'
            },
            [
                { number: 17, name: 'pread64', arity: 3 },
                { number: 201, name: 'time', arity: 1 }
            ]
        )
        expect(calls).toEqual([
            {
                number: 17,
                name: 'pread64',
                arity: 3,
                args: ['file descriptor', 'buffer (written by the kernel)', 'byte count'],
                blocking: true
            },
            { number: 201, name: 'time', arity: 1, args: [], blocking: false }
        ])
    })

    it('lists exactly the actual WASM dispatch table without loading a guest', async () => {
        const core = await createX86Emulator()
        try {
            expect(
                X86_SYSCALLS.map(({ number, name, arity }) => ({ number, name, arity }))
            ).toEqual(core.getImplementedSyscalls())
            expect(core.getCurrentInstructionSerial()).toBeNull()
            expect(core.getInstructionsExecuted()).toBe(0n)
        } finally {
            core.dispose()
        }
    })

    it.skipIf(!existsSync(join(blinkRoot, 'blink/strace.h')))(
        'is what the checkout generator writes',
        async () => {
            expect(X86_SYSCALLS).toEqual(await readBlinkSyscalls())
        }
    )
})
