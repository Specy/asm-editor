import { resolve } from '$app/paths'
import type { ResolvedPathname } from '$app/types'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { documentationLanguageOf, type DocumentationLanguage } from '#lib/search/scope.ts'

/** A line of the Explorer's hints card: what is worth knowing, and where to read about it. */
export type ExplorerTip = { text: string; href?: ResolvedPathname }

const course = (courseId: DocumentationLanguage) =>
    resolve('/learn/courses/[courseId]', { courseId })

const SHARED_TIPS: ExplorerTip[] = [{ text: 'Ctrl+K searches the documentation' }]

const TIPS: Record<DocumentationLanguage, ExplorerTip[]> = {
    m68k: [
        {
            text: 'Draw on the screen and read the keyboard and mouse with trap #15',
            href: resolve('/documentation/m68k/traps')
        },
        {
            text: 'Which flags each instruction sets',
            href: resolve('/documentation/m68k/condition-codes')
        },
        {
            text: 'Every addressing mode, with examples',
            href: resolve('/documentation/m68k/addressing-mode')
        },
        { text: 'Learn M68K step by step in the course', href: course('m68k') }
    ],
    mips: [
        {
            text: 'Draw pixels and read keys through the memory-mapped Screen',
            href: resolve('/documentation/mips/screen')
        },
        {
            text: 'Print, read input and exit with syscalls',
            href: resolve('/documentation/mips/syscall')
        },
        {
            text: 'Call printf from C with the Runtime library',
            href: resolve('/documentation/mips/runtime-library')
        },
        { text: 'Learn MIPS step by step in the course', href: course('mips') }
    ],
    'risc-v': [
        {
            text: 'Draw pixels and read keys through the memory-mapped Screen',
            href: resolve('/documentation/risc-v/screen')
        },
        {
            text: 'Print, read input and exit with ecalls',
            href: resolve('/documentation/risc-v/syscall')
        },
        {
            text: 'Call printf from C with the Runtime library',
            href: resolve('/documentation/risc-v/runtime-library')
        },
        { text: 'Learn RISC-V step by step in the course', href: course('risc-v') }
    ],
    x86: [
        {
            text: 'Print, read input and exit with Linux syscalls',
            href: resolve('/documentation/x86/syscall')
        },
        {
            text: 'Call printf from C with the Runtime library',
            href: resolve('/documentation/x86/runtime-library')
        },
        {
            text: 'Which instruction set extensions are supported',
            href: resolve('/documentation/x86/extensions')
        },
        { text: 'Learn x86-64 step by step in the course', href: course('x86') }
    ],
    z80: [
        {
            text: 'Talk to the console and peripherals through I/O ports',
            href: resolve('/documentation/z80/io')
        },
        {
            text: 'Every register and flag, and what sets it',
            href: resolve('/documentation/z80/registers')
        },
        { text: 'Learn Z80 step by step in the course', href: course('z80') }
    ]
}

/** Closing the hints card hides it until the next page load, in every Explorer. */
export const hintsDismissed = $state({ value: false })

/** Shuffled once per page load, so a reload shows other tips and a remount the same ones. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- This cache is populated inside $derived; writes must not be reactive.
const shuffled = new Map<DocumentationLanguage, ExplorerTip[]>()

/** `count` different tips about the language, fewer if it has not as many. */
export function explorerTips(language: AvailableLanguages, count: number): ExplorerTip[] {
    const documentation = documentationLanguageOf(language)
    let tips = shuffled.get(documentation)
    if (!tips) {
        tips = [...TIPS[documentation], ...SHARED_TIPS]
        for (let index = tips.length - 1; index > 0; index--) {
            const other = Math.floor(Math.random() * (index + 1))
            ;[tips[index], tips[other]] = [tips[other], tips[index]]
        }
        shuffled.set(documentation, tips)
    }
    return tips.slice(0, count)
}
