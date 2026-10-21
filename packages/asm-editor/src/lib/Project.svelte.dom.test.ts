/**
 * A Program's Testcases are edited in place: the Testcases panel binds to the array and pushes,
 * splices and assigns into it. Svelte proxies only plain objects and arrays, which is why a
 * Project's `programs` is a plain map and not a null-prototype one like its `files`
 * ([ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md)).
 * Only a browser build has the proxies, so this runs in the DOM project.
 */
import { afterEach, expect, it } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { makeProject, type Testcase } from '#lib/Project.svelte.ts'

function testcase(expectedOutput = ''): Testcase {
    return {
        input: [],
        expectedOutput,
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: []
    }
}

function twoPrograms() {
    return makeProject({
        language: 'MIPS',
        files: {
            'main.s': { encoding: 'plain', content: 'nop' },
            'other.s': { encoding: 'plain', content: 'nop' }
        },
        programs: {
            'main.s': { settings: {}, testcases: [testcase('main')] },
            'other.s': { settings: {}, testcases: [] }
        },
        selectedProgram: 'main.s'
    })
}

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

/** Re-reads `read` whenever what it read changes, as a component would. */
function watch<T>(read: () => T): T[] {
    const seen: T[] = []
    disposers.push(
        $effect.root(() => {
            $effect(() => {
                seen.push(read())
            })
        })
    )
    flushSync()
    return seen
}

it('reaches the Selected program from Testcases edited in place', () => {
    const project = twoPrograms()
    const count = watch(() => project.selected?.testcases.length)
    const output = watch(() => project.program('main.s')?.testcases[0]?.expectedOutput)
    const testcases = project.selected!.testcases
    testcases.push(testcase('pushed'))
    testcases[0].expectedOutput = 'edited'
    flushSync()
    expect(count).toEqual([1, 2])
    expect(output).toEqual(['main', 'edited'])
    expect(project.toObject().programs['main.s'].testcases.map((t) => t.expectedOutput)).toEqual([
        'edited',
        'pushed'
    ])
    expect(project.program('other.s')?.testcases).toEqual([])
})

it('keeps a Testcases array bound before a rename editing the moved Program', () => {
    const project = twoPrograms()
    const bound = project.selected!.testcases
    const count = watch(() => project.program('renamed.s')?.testcases.length)
    project.renameProgram('main.s', 'renamed.s')
    flushSync()
    bound.push(testcase('after'))
    flushSync()
    expect(count).toEqual([undefined, 1, 2])
    expect(project.selected?.testcases).toBe(project.program('renamed.s')?.testcases)
})

it('lets what reads the Programs follow a structural change and a new selection', () => {
    const project = twoPrograms()
    const entries = watch(() => Object.keys(project.programs).join(','))
    const selected = watch(() => project.selectedProgram)
    project.createProgram('third.s')
    flushSync()
    project.removeProgram('third.s')
    flushSync()
    project.selectProgram('other.s')
    flushSync()
    expect(entries).toEqual(['main.s,other.s', 'main.s,other.s,third.s', 'main.s,other.s'])
    expect(selected).toEqual(['main.s', 'third.s', 'main.s', 'other.s'])
})

it('keeps an Entry named __proto__ through a save and a reload, its view too', () => {
    //computed keys, since `__proto__:` in a literal would set the prototype rather than a key
    const project = makeProject({
        language: 'MIPS',
        files: {
            ['__proto__']: { encoding: 'plain', content: 'nop' },
            'main.s': { encoding: 'plain', content: 'nop' }
        },
        programs: {
            ['__proto__']: { settings: { programArguments: 'kept' }, testcases: [testcase('a')] },
            'main.s': { settings: {}, testcases: [] }
        },
        selectedProgram: '__proto__',
        fileViews: { ['__proto__']: 'hex' }
    })
    const saved = project.toObject()
    expect(Object.getPrototypeOf(saved.programs)).toBe(Object.prototype)
    expect(Object.keys(saved.programs)).toEqual(['__proto__', 'main.s'])
    expect(Object.keys(saved.fileViews ?? {})).toEqual(['__proto__'])
    //as IndexedDB, a share link or an archive gives it back
    const reloaded = makeProject(JSON.parse(JSON.stringify(saved)))
    expect(reloaded.selectedProgram).toBe('__proto__')
    expect(reloaded.selected?.settings).toEqual({ programArguments: 'kept' })
    expect(reloaded.selected?.testcases.map((item) => item.expectedOutput)).toEqual(['a'])
    expect(reloaded.fileViews).toEqual({ ['__proto__']: 'hex' })
})
