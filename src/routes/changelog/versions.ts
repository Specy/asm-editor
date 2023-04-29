
type Version = {
    version: string
    title?: string
    date: Date
    changes: string[]
    notes?: string[]
}   
export const versions: Version[] = [
    {
        version: '2.9.0',
        title: "Improved documentation",
        date: new Date('2023-04-29'),
        changes: [
            "Added side menu to all documentation pages",
            "Added more explanations to documentation for condition codes",
            "Added individual condition code dependent instructions",
            "Improved UI of documentation pages"
        ]
    },
    {
        version: '2.8.0',
        title: "Negative numbers in register viewer",
        date: new Date('2023-04-28'),
        changes: [
            "Added negative numbers conversion in register viewer",
            "Bug fix of interpreter for directive name clash"
        ]
    }, 
    {
        version: '2.7.0',
        title: 'Changed interactive documentation',
        date: new Date('2023-04-24'),
        changes: [
            'Added side menu to interactive documentation',
            'Improved transitions between pages',
        ]
    },{
        version: '2.6.5',
        title: 'Bug fixes and more diffings',
        date: new Date('2023-03-22'),
        changes: [
            'Added status code diffing',
            'Fixed bugs in interactive documentation',
        ]
    },
    {
        version: '2.6.0',
        title: 'Interactive documentation',
        date: new Date('2023-03-15'),
        changes: [
            'Changed documentation layout to have future more languages',
            'Added an interactive documentation for each instruction',
            'Bug fixes for some instructions (rod, asd, lsd) ',
            'Other bug fixes and improvements',
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
        changes: [
            'Added callstack tracing',
            'Added mutations history',
            'UI fixes',
        ]
    },
    {
        version: '2.4.1',
        date: new Date('2023-01-11'),
        title: 'Performance and error improvements',
        changes: [
            'Improved by 3x the interpreter performance and bugfix',
            'Improved interpreter errors',
            'Changed hero page',
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
            'Improved animations',
        ]
    },  
    {
        version: '2.3.0',
        date: new Date('2022-11-03'),
        title: 'Shortcuts and strings',
        changes: [
            'Added editable shortcuts',
            'Added support for strings in the interpreter and memory viewer',
            'Interpreter bug fixes',
        ]
    },
    {
        version: '2.2.0',
        date: new Date('2022-10-26'),
        title: 'Stack viewer and documentation',
        changes: [
            'Added stack viewer',
            'Improve documentation and inline documentation',
            'Interpreter bug fixes',

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
            'Improved animations',

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
            'Removed mips emulator',

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
            'Improved code suggestions',
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
            'Added Service Worker for offline support and installation',
        ]
    }


]