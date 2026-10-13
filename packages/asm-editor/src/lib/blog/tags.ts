export const BLOG_TAG_IDS = [
    'guide',
    'use-case',
    'behind-the-scenes',
    'mips',
    'risc-v',
    'x86',
    'c-cpp',
    'teaching',
    'reverse-engineering'
] as const

export type BlogTagId = (typeof BLOG_TAG_IDS)[number]

export const BLOG_TAGS: Record<BlogTagId, { label: string; description: string }> = {
    guide: {
        label: 'guide',
        description: 'Set up projects, run programs, and use the ASM Editor debugger.'
    },
    'use-case': {
        label: 'use case',
        description:
            'Use ASM Editor for coursework, teaching, C/C++ compilation, and executable analysis.'
    },
    'behind-the-scenes': {
        label: 'behind the scenes',
        description:
            'How ASM Editor loads programs, simulates instructions, and displays machine state.'
    },
    mips: {
        label: 'MIPS',
        description: "Run and debug MIPS assembly with ASM Editor's MARS-based simulator."
    },
    'risc-v': {
        label: 'RISC-V',
        description:
            'Run and debug 32-bit and 64-bit RISC-V assembly with the RARS-based simulator.'
    },
    x86: {
        label: 'x86',
        description: 'Write x86-64 assembly, import executables, and inspect registers and memory.'
    },
    'c-cpp': {
        label: 'C/C++',
        description: 'Compile C/C++ to assembly and debug it alongside the source.'
    },
    teaching: {
        label: 'teaching',
        description: 'Create classroom demonstrations, shared projects, and testable exercises.'
    },
    'reverse-engineering': {
        label: 'reverse engineering',
        description:
            'Inspect x86-64 executables using disassembly, breakpoints, registers, and memory.'
    }
}

export function isBlogTag(value: string): value is BlogTagId {
    return Object.hasOwn(BLOG_TAGS, value)
}
