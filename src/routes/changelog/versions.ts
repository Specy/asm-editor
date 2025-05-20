type Version = {
    version: string
    title?: string
    date: Date
    changes: string[]
    notes?: string[]
}
export const versions: Version[] = [
    {
        version: '6.1.0',
        title: 'Assembly Courses',
        date: new Date('2025-05-20'),
        changes: [
            "Added a learning section where you can learn assembly language, we are looking for people to help us create courses!",
        ]
    },
    {
        version: '6.0.0',
        title: 'RISC-V language',
        date: new Date('2025-05-16'),
        changes: [
            "Added RISC-V assembler/simulator",
            "Added RISC-V documentation",
        ]
    },
    {
        version: '5.0.0',
        title: 'X86 language',
        date: new Date('2025-04-13'),
        changes: [
            "Added X86 assembler/simulator (basic version)",
        ]
    },
    {
        version: '4.0.0',
        title: 'MIPS language',
        date: new Date('2025-02-13'),
        changes: [
            'Added MIPS assembler/simulator (mars)',
            'Added MIPS documentation',
            'Other improvements and bug fixes'
        ]
    },
    {
        version: '3.5.0',
        title: 'Migrated website to svelte 5 & preparations for MIPS',
        date: new Date('2025-02-09'),
        changes: [
            'Migrated website to svelte 5',
            'Made the UI more generic over different languages, MIPS interpreter is coming soon'
        ]
    },
    {
        version: '3.4.0',
        title: 'Improved editor and bug fixes',
        date: new Date('2024-07-02'),
        changes: [
            'Improved memory address resolve (now implements full 32 bit addressing)',
            'Added more strict memory read/write checks for odd addresses in non-byte operations',
            'Added alignment errors in compilation'
        ]
    },
    {
        version: '3.3.0',
        title: 'Testcases and base index addressing',
        date: new Date('2024-06-12'),
        changes: [
            'Added testcases creation, you can create testcases with an initial configuration and expected output',
            'Added base index addressing mode',
            'Added MOVEM instruction'
        ]
    },
    {
        version: '3.2.0',
        title: 'Memory region viewer',
        date: new Date('2024-06-1'),
        changes: [
            `Added memory region viewer, you can select up to 4 bytes of memory to convert it's value in decimal/signed decimal`,
            'Fixed bug when prompting for single character input'
        ]
    },
    {
        version: '3.1.0',
        title: 'Share by URL, labels on top',
        date: new Date('2024-04-30'),
        changes: [
            'Added share by URL, you can now share your code by including it in a sharable URL',
            'Whenever there is indentation in the code (for example labels at the start of the line, plus indented code), the label will be "fixed" at the top of the editor',
            'Added embeddable editor, you can now embed the editor in your website'
        ]
    },
    {
        version: '3.0.0',
        title: 'Improved performance and bugfix',
        date: new Date('2023-10-28'),
        changes: [
            'Improved performance by 3x, now runs at +-30mhz',
            'Bug fixes during compilation and execution',
            'Improved UI on mobile for the interactive documentation',
            'Improved UI on the editor'
        ]
    },
    {
        version: '2.9.0',
        title: 'Improved documentation',
        date: new Date('2023-04-29'),
        changes: [
            'Added side menu to all documentation pages',
            'Added more explanations to documentation for condition codes',
            'Added individual condition code dependent instructions',
            'Improved UI of documentation pages'
        ]
    },
    {
        version: '2.8.0',
        title: 'Negative numbers in register viewer',
        date: new Date('2023-04-28'),
        changes: [
            'Added negative numbers conversion in register viewer',
            'Bug fix of interpreter for directive name clash'
        ]
    },
    {
        version: '2.7.0',
        title: 'Changed interactive documentation',
        date: new Date('2023-04-24'),
        changes: [
            'Added side menu to interactive documentation',
            'Improved transitions between pages'
        ]
    },
    {
        version: '2.6.5',
        title: 'Bug fixes and more diffings',
        date: new Date('2023-03-22'),
        changes: ['Added status code diffing', 'Fixed bugs in interactive documentation']
    },
    {
        version: '2.6.0',
        title: 'Interactive documentation',
        date: new Date('2023-03-15'),
        changes: [
            'Changed documentation layout to have future more languages',
            'Added an interactive documentation for each instruction',
            'Bug fixes for some instructions (rod, asd, lsd) ',
            'Other bug fixes and improvements'
        ]
    },
    {
        version: '2.5.1',
        title: 'PWA improvements',
        date: new Date('2023-01-27'),
        changes: [
            'Added PWA launch queue and file system api',
            'Improved interrupt text',
            'PWA bugfixes and improvements',
            'Added changelog page'
        ]
    },
    {
        version: '2.5.0',
        date: new Date('2023-01-15'),
        title: 'Callstack tracing and mutations history',
        changes: ['Added callstack tracing', 'Added mutations history', 'UI fixes']
    },
    {
        version: '2.4.1',
        date: new Date('2023-01-11'),
        title: 'Performance and error improvements',
        changes: [
            'Improved by 3x the interpreter performance and bugfix',
            'Improved interpreter errors',
            'Changed hero page'
        ]
    },
    {
        version: '2.4.0',
        date: new Date('2022-12-18'),
        title: 'Undo, register chunking, custom themes',
        changes: [
            'Added undo',
            'Added register chunking',
            'Added custom themes',
            'Improved interpreter performance and bugfix',
            'Added more instructions'
        ]
    },
    {
        version: '2.3.1',
        date: new Date('2022-12-15'),
        title: 'General improvements',
        changes: [
            'Improved SEO',
            'Improved accessibility',
            'Improved performance',
            'Improved animations'
        ]
    },
    {
        version: '2.3.0',
        date: new Date('2022-11-03'),
        title: 'Shortcuts and strings',
        changes: [
            'Added editable shortcuts',
            'Added support for strings in the interpreter and memory viewer',
            'Interpreter bug fixes'
        ]
    },
    {
        version: '2.2.0',
        date: new Date('2022-10-26'),
        title: 'Stack viewer and documentation',
        changes: [
            'Added stack viewer',
            'Improve documentation and inline documentation',
            'Interpreter bug fixes'
        ]
    },
    {
        version: '2.1.0',
        title: 'Settings and documentation',
        date: new Date('2022-10-23'),
        changes: [
            'Added m68k documentation',
            'Added settings',
            'Added inline documentation',
            'Improved editor styling',
            'Improved animations'
        ]
    },
    {
        version: '2.0.0',
        date: new Date('2022-10-19'),
        title: 'Interpreter rewrite and new features',
        changes: [
            'Changed m68k to custom made rust m68k emulator',
            'Improved performance',
            'Added semantic checking',
            'Added better code suggestions',
            'Added more instructions',
            'Added more directives',
            'Added breakpoints',
            'Added stepping',
            'Removed mips emulator'
        ]
    },
    {
        version: '1.0.1',
        date: new Date('2022-04-09'),
        title: 'MIPS and formatter',
        changes: [
            'Added mips emulator (buggy)',
            'Added animations',
            'Added formatter',
            'Improved code suggestions'
        ]
    },
    {
        version: '1.0.0',
        date: new Date('2022-04-06'),
        title: 'Initial release',
        changes: [
            'Initial release',
            'Added m68k emulator',
            'Added register viewer',
            'Added initial editor and syntax highlighting',
            'Added Service Worker for offline support and installation'
        ]
    }
]
