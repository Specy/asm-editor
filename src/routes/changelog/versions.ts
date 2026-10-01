type Version = {
    version: string
    title?: string
    date: Date
    changes: string[]
    notes?: string[]
}
export const versions: Version[] = [
    {
        version: '11.1.0',
        title: 'Search the documentation and the courses',
        date: new Date('2026-10-01'),
        changes: [
            'Search the documentation and the courses by words or by meaning: "print a number" finds the service that prints one and the lecture that explains it',
            'The documentation panel of the editor lists every instruction, directive, syscall, register and port as a short row that opens in place, with buttons to jump between sections, and shows everything the documentation pages show',
            'Ctrl+K (⌘K on a Mac) opens the documentation search from anywhere in the editor, and the search window on the documentation pages and in the courses',
            'Search runs in your browser: the first visit downloads a small model, about 18 MB, which then works offline. A browser set to save data searches by words only',
            'The AI assistant can look things up in the documentation and the courses',
            'Each language has a box at the top of its documentation and of its course, and a link to a lecture can now point at one of its sections'
        ],
        notes: [
            'During an exam the documentation panel searches the documentation only, never the courses'
        ]
    },
    {
        version: '11.0.0',
        title: 'New editor layout',
        date: new Date('2026-09-30'),
        changes: [
            'Redesigned the project editor to look like an IDE: a bar of icons opens the files, testcases, documentation, AI assistant and settings beside the code, open files are tabs, and the terminal, a log of builds and tests, and the problems sit under the code',
            'Building opens a debugger column with the registers, memory and screen; the stack pointer, history and call stack can float as windows or sit in that column',
            'Every panel can be resized, and the editor remembers sizes and folded sections',
            'Documentation and testcases can be maximized over the editor to read them',
            'Testcases are edited in place: each has a name, its registers and memory are tables typed in hex or decimal, and the last run shows what each value really was, beside a Run all button',
            'Settings now also hold the MARS and RARS display, the keyboard shortcuts and the themes; the separate themes page is gone',
            'Added a setting to show panels as cards or as edge to edge lines',
            'Phones and tablets have their own layout, with the build and run buttons always in reach',
            'Exam sessions use the new editor, with the exercise in a panel beside the code'
        ],
        notes: [
            'The "Show memory tab" and "Show screen" preferences were removed: memory and the screen are always part of the debugger'
        ]
    },
    {
        version: '10.0.0',
        title: 'Graphics and simulators overhaul',
        date: new Date('2026-09-20'),
        changes: [
            'MIPS, RISC-V and M68K simulators now implement more instructions and directives',
            "Improved M68K's assembler so that it gives better error messages and warnings",
            'Stabilized X86 simulator to NASM syntax. Assembling and checking now runs quickly. Added instruction documentation, autocomplete and course.',
            'Added Graphics, Mouse and Keyboard support to MIPS, RISC-V, M68K and Z80 simulators',
            'Added possibility to edit registers and memory while debugging'
        ],
        notes: []
    },
    {
        version: '9.1.0',
        title: 'Project settings and files',
        date: new Date('2026-09-07'),
        changes: [
            'Added project wide settings instead of global preferences',
            'A project is now made of multiple files with an entry file called main.<ext>. You can now write multi file projects'
        ],
        notes: [
            'Existing projects start from the default settings; the values set before this version are not carried over'
        ]
    },
    {
        version: '9.0.0',
        title: 'Z80 language',
        date: new Date('2026-09-01'),
        changes: [
            'Added Z80 assembler/emulator with a port based console',
            'Added Z80 documentation with editor hover and completion'
        ]
    },
    {
        version: '8.0.0',
        title: 'New X86 emulator',
        date: new Date('2026-04-26'),
        changes: [
            'Changed the X86 emulator to Blink, which now supports the proper debugging tools and features',
            'Added AI assistant for exam review mode, to help professors grade exams faster.'
        ]
    },
    {
        version: '7.0.0',
        title: 'AI and new Exam Mode',
        date: new Date('2026-04-05'),
        changes: [
            'Added an AI assistant in every editor that has control of the editor and emulator. You can ask for help with your code and get suggestions and explanations',
            'Improved the exam mode to have sections, like assembly, c, open and closed questions.',
            'Improved MIPS and RISC-V documentation and hover documentation',
            'Added new single page documentation which is easier to print'
        ]
    },
    {
        version: '6.3.0',
        title: 'Exam mode',
        date: new Date('2025-07-15'),
        changes: [
            'Added exam mode, where you can create exams for students and have their editor locked during the exam',
            'Added initial course for general assembly languages'
        ]
    },
    {
        version: '6.2.0',
        title: 'Slight redesign and examples course',
        date: new Date('2025-05-22'),
        changes: [
            'Changed fonts, colors and some UI elements',
            'Improved loading performance',
            'Added examples course, where you can find different assembly examples for each language'
        ]
    },
    {
        version: '6.1.0',
        title: 'Assembly Courses',
        date: new Date('2025-05-20'),
        changes: [
            'Added a learning section where you can learn assembly language, we are looking for people to help us create courses!'
        ]
    },
    {
        version: '6.0.0',
        title: 'RISC-V language',
        date: new Date('2025-05-16'),
        changes: ['Added RISC-V assembler/simulator', 'Added RISC-V documentation']
    },
    {
        version: '5.0.0',
        title: 'X86 language',
        date: new Date('2025-04-13'),
        changes: ['Added X86 assembler/simulator (basic version)']
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
