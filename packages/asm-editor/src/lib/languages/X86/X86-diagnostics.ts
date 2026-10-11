/**
 * What NASM's warnings mean, keyed by the class NASM itself names them with.
 *
 * NASM says what is wrong in the words of someone who already knows x86: "byte
 * exceeds bounds", "uninitialized space declared in non-BSS section". These say
 * what the assembler did about it and what to write instead, which is the part
 * a reader learning x86 is missing.
 *
 * A class with no entry here keeps NASM's own message and nothing more, so this
 * map only needs to cover what someone is likely to hit.
 */
export const X86_DIAGNOSTIC_HINTS: Record<string, string> = {
    'label-orphan':
        'A label needs a colon, so NASM read this name as an instruction instead. Write `name:` to make it a label.',
    'number-overflow':
        'The value does not fit the size it was written into, so only its low bits are kept. `al` holds 8 bits, `ax` 16, `eax` 32.',
    zeroing:
        '`resb`, `resw` and `resq` reserve space without giving it a value, which only works in `section .bss`. Here NASM writes zeros instead. Move it to `.bss`, or use `db`/`dw`/`dq` to give it a value.',
    'db-empty':
        '`db` with nothing after it reserves no bytes at all. Give it a value, as in `db 0`.',
    'prefix-seg':
        '64-bit mode ignores the `es`, `cs`, `ds` and `ss` segment prefixes, so this one does nothing. Only `fs` and `gs` still change which address is used.',
    ptr: '`ptr` is MASM syntax. NASM writes the size before the brackets, as in `mov eax, dword [x]`.',
    forward:
        'This value is not known yet on the pass that needs it, so NASM guessed how many bytes to leave for it. Define the symbol before it is used, or give the size explicitly.',
    'label-redef':
        'This label is defined more than once. NASM keeps the last definition, so jumps to it may not go where you expect.',
    'obsolete-nop':
        'This instruction exists on the target CPU but does nothing at all, so it was assembled as a no-op.',
    'obsolete-valid':
        'This instruction still works on the target CPU, but it belongs to an older generation and newer code does not use it.',
    'obsolete-removed': 'This instruction was removed from the target CPU, so it cannot run here.',
    regsize:
        'The size is already fixed by the register, so writing it again changes nothing. `mov eax, ...` is always 32 bits.',
    'float-overflow': 'This number is too large for the floating-point size it was written into.',
    'number-deprecated-hex':
        'A `$` prefix for hexadecimal is deprecated. Write `0x` instead, as in `0x1f`.',
    'prefix-lock-xchg':
        '`xchg` with a memory operand is already atomic, so the `lock` prefix adds nothing.',
    'pp-macro-params-multi':
        'This macro was called with a number of arguments it was not defined to take. Check the count in its `%macro` line.',
    'pp-macro-params-single':
        'This macro was called with a number of arguments it was not defined to take. Check the count in its `%define` line.',
    user: 'This is a `%warning` from the code itself, not from NASM.',
    'entry-point':
        '`_start` is where the program begins, the way `main` begins a C program. The linker looks for that exact name, and it has to be exported with `global _start`, not only defined as a label.'
}

/** The explanation for a diagnostic, when its class has one. */
export function x86DiagnosticHint(warningClass: string | undefined): string | undefined {
    return warningClass ? X86_DIAGNOSTIC_HINTS[warningClass] : undefined
}
