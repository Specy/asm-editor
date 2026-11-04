import { describe, expect, it } from 'vite-plus/test'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { makeMipsCore } from '#lib/languages/MIPS/MIPS-core.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { makeRiscVCore } from '#lib/languages/RISC-V/RISC-V-core.ts'
import { analyzeMarsProject } from '#lib/languages/service/adapters/marsAdapter.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { projectBuildSources } from '#lib/buildSources.ts'
import { buildConfigurationKey, type BuildSources, type ProjectFiles } from '#lib/projectFiles.ts'
import { provideRuntimeLibrary } from '#lib/sourceRuntime/runtimeLibrary.ts'
import {
    fileFingerprint,
    type CompilationRecord,
    type CompilationSourceMap
} from '#lib/sourceCompilation/records.ts'
import { coreBreakpoints, currentSourceMaps } from '#lib/sourceCompilation/sourceBreakpoints.ts'
import { checkMarsProgram, type MarsCheckCore, type MarsCoreFactory } from './marsCheck'

/**
 * A MIPS or RISC-V Program of several compiled units, against the real Cores: the Entry's unit and
 * the Project's other Generated assembly, which the Core takes as an archive's members by need
 * ([asmOS portability](../../../../../../docs/design/asmos-portability.md), decisions 11 and 12).
 * The Generated assembly is written the way Clang and GCC write it, `.LBB0_1`/`$L2` blocks and
 * `static` names in both units, with `# @N` marking the C line an instruction comes from, which the
 * tests turn into the Source map Compiler Explorer would give.
 */

const C_MAIN = `static int counter = 100;
static int helper(int x) {
    return x + counter;
}
int base = 3;
int twice(int x);
extern int offset;
int main(void) {
    int v = twice(helper(5));
    return v + offset;
}
`
const C_TWICE = `static int counter = 1000;
extern int base;
int offset = 20000;
static int helper(int x) {
    return x + counter;
}
int twice(int x) {
    for (int i = 0; i < 1; i++) x = x + x;
    return helper(x) + base;
}
`
const C_UNUSED = 'int unused(void) { return 1; }\n'
const C_OTHER = 'int main(void) { return 7; }\n'
/** main returns twice(helper(5)) + offset: (5 + 100) * 2 + 1000 + 3 + 20000. */
const RESULT = 21213

const RISCV = {
    main: `	.text
	.file	"main.c"
	.globl	main
	.p2align	2
	.type	main,@function
main:
	addi	sp, sp, -16 # @7
	sw	ra, 12(sp) # @7
	j	.LBB0_1 # @7
.LBB0_1:
	li	a0, 5 # @8
	call	helper # @8
	call	twice # @8
	lui	a1, %hi(offset) # @9
	lw	a1, %lo(offset)(a1) # @9
	add	a0, a0, a1 # @9
	lw	ra, 12(sp) # @10
	addi	sp, sp, 16 # @10
	ret # @10
.Lfunc_end0:
	.size	main, .Lfunc_end0-main
	.p2align	2
	.type	helper,@function
helper:
	lui	a1, %hi(counter) # @2
	lw	a1, %lo(counter)(a1) # @2
	add	a0, a0, a1 # @2
	ret # @2
.Lfunc_end1:
	.size	helper, .Lfunc_end1-helper
	.type	counter,@object
	.data
	.p2align	2
counter:
	.word	100
	.size	counter, 4
	.type	base,@object
	.globl	base
	.p2align	2
base:
	.word	3
	.size	base, 4
`,
    twice: `	.text
	.file	"twice.c"
	.globl	twice
	.p2align	2
	.type	twice,@function
twice:
	addi	sp, sp, -16 # @6
	sw	ra, 12(sp) # @6
	li	a1, 0 # @7
	j	.LBB0_2 # @7
.LBB0_1:
	add	a0, a0, a0 # @7
	addi	a1, a1, 1 # @7
.LBB0_2:
	blez	a1, .LBB0_1 # @7
	call	helper # @8
	lui	a1, %hi(base) # @8
	lw	a1, %lo(base)(a1) # @8
	add	a0, a0, a1 # @8
	lw	ra, 12(sp) # @9
	addi	sp, sp, 16 # @9
	ret # @9
.Lfunc_end0:
	.size	twice, .Lfunc_end0-twice
	.p2align	2
	.type	helper,@function
helper:
	lui	a1, %hi(counter) # @4
	lw	a1, %lo(counter)(a1) # @4
	add	a0, a0, a1 # @4
	ret # @4
.Lfunc_end1:
	.size	helper, .Lfunc_end1-helper
	.type	counter,@object
	.data
	.p2align	2
counter:
	.word	1000
	.size	counter, 4
	.type	offset,@object
	.globl	offset
	.p2align	2
offset:
	.word	20000
	.size	offset, 4
`,
    unused: '\t.text\n\t.globl\tunused\n\t.p2align\t2\nunused:\n\tli\ta0, 1\n\tret\n',
    other: '\t.text\n\t.globl\tmain\n\t.p2align\t2\nmain:\n\tli\ta0, 7\n\tret\n',
    mistake: 'bogus\ta0, a0\n',
    crt0: '.text\n.globl _start\n_start:\ncall main\nli a7,93\necall\n'
}

const MIPS = {
    main: `	.text
	.globl	main
	.type	main, @function
main:
	addiu	$sp,$sp,-24 # @7
	sw	$31,20($sp) # @7
	b	$L2 # @7
$L2:
	li	$4,5 # @8
	jal	helper # @8
	move	$4,$2 # @8
	jal	twice # @8
	lui	$3,%hi(offset) # @9
	lw	$3,%lo(offset)($3) # @9
	addu	$2,$2,$3 # @9
	lw	$31,20($sp) # @10
	addiu	$sp,$sp,24 # @10
	jr	$31 # @10
	.size	main, .-main
	.type	helper, @function
helper:
	lui	$3,%hi(counter) # @2
	lw	$3,%lo(counter)($3) # @2
	addu	$2,$4,$3 # @2
	jr	$31 # @2
	.size	helper, .-helper
	.data
	.align	2
	.type	counter, @object
counter:
	.word	100
	.globl	base
	.type	base, @object
base:
	.word	3
`,
    twice: `	.text
	.globl	twice
	.type	twice, @function
twice:
	addiu	$sp,$sp,-24 # @6
	sw	$31,20($sp) # @6
	move	$2,$4 # @6
	li	$5,0 # @7
	b	$L2 # @7
$L3:
	addu	$2,$2,$2 # @7
	addiu	$5,$5,1 # @7
$L2:
	blez	$5,$L3 # @7
	move	$4,$2 # @8
	jal	helper # @8
	lui	$3,%hi(base) # @8
	lw	$3,%lo(base)($3) # @8
	addu	$2,$2,$3 # @8
	lw	$31,20($sp) # @9
	addiu	$sp,$sp,24 # @9
	jr	$31 # @9
	.size	twice, .-twice
	.type	helper, @function
helper:
	lui	$3,%hi(counter) # @4
	lw	$3,%lo(counter)($3) # @4
	addu	$2,$4,$3 # @4
	jr	$31 # @4
	.size	helper, .-helper
	.data
	.align	2
counter:
	.word	1000
	.globl	offset
	.type	offset, @object
offset:
	.word	20000
`,
    unused: '\t.text\n\t.globl\tunused\nunused:\n\tli\t$2,1\n\tjr\t$31\n',
    other: '\t.text\n\t.globl\tmain\nmain:\n\tli\t$2,7\n\tjr\t$31\n',
    mistake: 'bogus\t$4,$4\n',
    crt0: '.text\n.globl _start\n_start:\njal main\nmove $4,$2\nli $2,17\nsyscall\n'
}

const TARGETS = [
    {
        language: 'RISC-V' as const,
        extension: 'riscv',
        asm: RISCV,
        target: 'riscv32',
        make: RISCVEmulator
    },
    { language: 'MIPS' as const, extension: 'mips', asm: MIPS, target: 'mips', make: MIPSEmulator }
]
for (const { language, target, asm } of TARGETS)
    provideRuntimeLibrary('v1', language, {
        abi: 'v1',
        target,
        compiler: 'test',
        members: { '@runtime/v1/crt0.s': asm.crt0 },
        index: { _start: '@runtime/v1/crt0.s' },
        memberSources: {}
    })

const text = (content: string) => ({ encoding: 'plain' as const, content })

describe.each(TARGETS)('$language: a Program of several compiled units', (spec) => {
    const { language, extension, asm, make } = spec
    const path = (name: string) => `${name}.c.${extension}`
    const outputs = { main: asm.main, twice: asm.twice, unused: asm.unused, other: asm.other }
    const sourcesOf = { main: C_MAIN, twice: C_TWICE, unused: C_UNUSED, other: C_OTHER }

    function project(change: Partial<Record<keyof typeof outputs, string>> = {}) {
        const files: Record<string, ReturnType<typeof text>> = {}
        for (const name of Object.keys(outputs) as (keyof typeof outputs)[]) {
            files[`${name}.c`] = text(sourcesOf[name])
            files[path(name)] = text(change[name] ?? outputs[name])
        }
        const compilations: CompilationRecord[] = (
            Object.keys(outputs) as (keyof typeof outputs)[]
        ).map((name) => ({
            sourcePath: `${name}.c`,
            outputPath: path(name),
            target: language,
            language: 'c',
            compilerId: 'test',
            optimization: '0',
            inputs: { [`${name}.c`]: fileFingerprint(files[`${name}.c`])! },
            outputFingerprint: fileFingerprint(files[path(name)])!,
            assemblerProfile: 'gnu-compiler-v1',
            runtimeAbi: 'v1'
        }))
        return { files: files as ProjectFiles, compilations }
    }
    /** The Source map of a unit, from the `# @N` each instruction carries. */
    function sourceMap(files: ProjectFiles, name: keyof typeof outputs): CompilationSourceMap {
        const file = files[path(name)]
        const lines = (file.encoding === 'plain' ? file.content : '').split('\n').map((line) => {
            const marker = /# @(\d+)$/.exec(line)
            return marker ? { path: `${name}.c`, line: Number(marker[1]) } : null
        })
        return { sourcePath: `${name}.c`, outputFingerprint: fileFingerprint(file)!, lines }
    }
    function sources(entry = path('main'), change?: Partial<Record<keyof typeof outputs, string>>) {
        const { files, compilations } = project(change)
        return {
            sources: projectBuildSources({ files, entry, language, compilations }),
            compilations
        }
    }
    async function build(input: BuildSources) {
        const emulator = make(input, { language })
        await emulator.check()
        await emulator.compile(200_000, input)
        return emulator
    }
    const errors = (emulator: { compilerDiagnostics: readonly Diagnostic[] }) =>
        emulator.compilerDiagnostics.filter((d) => d.severity === 'error')

    it("takes the Project's other compiled units as its own, the Entry choosing the Program", () => {
        const { sources: built } = sources()
        expect(built.linkUnits).toEqual([path('other'), path('twice'), path('unused')])
        expect(built.compiledLanguages).toEqual({
            [path('main')]: 'c',
            [path('other')]: 'c',
            [path('twice')]: 'c',
            [path('unused')]: 'c'
        })
        expect(built).toMatchObject({ runtimeAbi: 'v1', entrySymbol: '_start' })
        //a hand-written Entry in the Core's own dialect links no other unit, as before
        const { files, compilations } = project()
        const manual = projectBuildSources({
            files: { ...files, 'main.s': text('main:\n') },
            entry: 'main.s',
            language,
            compilations
        })
        expect(manual.linkUnits).toBeUndefined()
        //every assembly File of the Target is one, hand-written or not, by the Target's own
        //extension, `.asm` or `.s`; another Target's assembly, an include fragment and an
        //extension-less File are not, nor another Program's Entry or what that one includes
        const foreign = language === 'MIPS' ? 'riscv' : 'mips'
        const mixed = projectBuildSources({
            files: {
                ...files,
                [`hand.${extension}`]: text(asm.unused),
                'hand.asm': text(asm.unused),
                'lib/hand.S': text(asm.unused),
                [`elsewhere.c.${foreign}`]: text(asm.unused),
                'macros.inc': text(asm.unused),
                Makefile: text('all:\n'),
                'picture.bmp': { encoding: 'base64', content: 'AA==' },
                'game/main.s': text('.include "parts.s"\n.include "/shared/data.asm"\nmain:\n'),
                'game/parts.s': text(asm.unused),
                'shared/data.asm': text(asm.unused)
            },
            entry: path('main'),
            language,
            compilations,
            programs: [path('main'), 'game/main.s', path('other')]
        })
        expect(mixed.linkUnits).toEqual([
            'hand.asm',
            `hand.${extension}`,
            'lib/hand.S',
            path('twice'),
            path('unused')
        ])
        //a configuration without units is named as before they existed
        const { linkUnits, ...without } = built
        expect(linkUnits).toBeDefined()
        expect(JSON.parse(buildConfigurationKey(without))).toHaveLength(7)
        expect(buildConfigurationKey(built)).not.toBe(buildConfigurationKey(without))
    })

    it('builds and runs the units together, each with its own local labels and statics', async () => {
        const { sources: built } = sources()
        const emulator = await build(built)
        try {
            expect(errors(emulator)).toEqual([])
            //the two units nothing needs were never assembled, and say why they are left out
            const hints = emulator.compilerDiagnostics.filter((d) => d.code === 'not-linked')
            expect(hints.map((d) => d.file).sort()).toEqual([path('other'), path('unused')])
            expect(emulator.buildArtifacts.some((a) => a.file === path('unused'))).toBe(false)
            expect(emulator.buildArtifacts.some((a) => a.file === path('twice'))).toBe(true)
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: RESULT })
        } finally {
            emulator.dispose()
        }
        //the other Program's Entry is its own main, and leaves this one's main out
        const other = await build(sources(path('other')).sources)
        try {
            expect(errors(other)).toEqual([])
            await other.run(1_000_000)
            expect(other.termination).toEqual({ kind: 'exit', code: 7 })
            expect(other.buildArtifacts.some((a) => a.file === path('main'))).toBe(false)
        } finally {
            other.dispose()
        }
    })

    it("steps into the other unit as the program's own code, and stops at its Breakpoints", async () => {
        const { sources: built, compilations } = sources()
        const emulator = await build(built)
        try {
            expect(emulator.currentFile).toBe(path('main'))
            //Step goes into twice, which is no library code to run through
            const files: string[] = []
            for (let i = 0; i < 30 && emulator.currentFile !== path('twice'); i++) {
                await emulator.step()
                files.push(emulator.currentFile!)
            }
            expect(emulator.currentFile).toBe(path('twice'))
            expect(emulator.line).toBe(asm.twice.split('\n').findIndex((l) => l.includes('# @6')))
            //and Undo comes back out of it
            emulator.undo(1)
            expect(emulator.currentFile).toBe(path('main'))
        } finally {
            emulator.dispose()
        }

        //a Breakpoint on the other unit's assembly, and one on its C source
        const maps = currentSourceMaps(
            {
                [path('twice')]: sourceMap(built.files, 'twice'),
                [path('main')]: sourceMap(built.files, 'main')
            },
            compilations,
            built.files,
            language
        )
        expect(maps.map((map) => map.outputPath).sort()).toEqual([path('main'), path('twice')])
        const helperLine = asm.twice.split('\n').findIndex((l) => l.includes('# @4'))
        for (const breakpoint of [
            { file: path('twice'), line: helperLine },
            { file: 'twice.c', line: 4 }
        ]) {
            const stopped = await build(built)
            try {
                stopped.setBreakpointResolver((breakpoints) =>
                    coreBreakpoints(breakpoints, maps, language)
                )
                stopped.toggleBreakpoint(breakpoint.line, breakpoint.file)
                await stopped.run(1_000_000)
                expect(stopped.terminated).toBe(false)
                expect({ file: stopped.currentFile, line: stopped.line }).toEqual({
                    file: path('twice'),
                    line: helperLine
                })
            } finally {
                stopped.dispose()
            }
        }
    })

    it("lists every unit's labels and data in its own File", async () => {
        const emulator = await build(sources().sources)
        try {
            const labels = emulator.programSymbols!.labels
            const counters = labels.filter((label) => label.name === 'counter')
            expect(counters.map((label) => label.definition?.file).sort()).toEqual([
                path('main'),
                path('twice')
            ])
            const helpers = labels.filter((label) => label.name === 'helper')
            expect(helpers.map((label) => label.definition?.file).sort()).toEqual([
                path('main'),
                path('twice')
            ])
            //a compiler's own block labels are no label to list, in either unit
            expect(labels.some((label) => /^(\.L|\$L)/.test(label.name))).toBe(false)
            //the memory regions name both counters, each by its File
            const data = emulator.dataLabels.filter((label) => label.name === 'counter')
            expect(data.map((label) => label.file).sort()).toEqual([path('main'), path('twice')])
            expect(new Set(data.map((label) => label.address)).size).toBe(2)
            expect(data.every((label) => !label.fromLibrary)).toBe(true)
        } finally {
            emulator.dispose()
        }
    })

    it("reports a mistake in a unit the program needs in that unit's File, saying why it is linked", async () => {
        const broken = sources(path('main'), { twice: outputs.twice + asm.mistake }).sources
        const emulator = make(broken, { language })
        try {
            await expect(emulator.compile(200, broken)).rejects.toThrow()
            const [why, error] = errors(emulator)
            //first on the line that declares what the program needs from it
            expect(why).toMatchObject({
                file: path('twice'),
                lineIndex: outputs.twice.split('\n').indexOf('\t.globl\ttwice'),
                message: expect.stringMatching(
                    new RegExp(
                        `^${path('twice').replaceAll('.', '\\.')} is linked into this program because it defines twice, which the program uses\\.`
                    )
                )
            })
            const line = (outputs.twice + asm.mistake).split('\n').length - 2
            expect(error).toMatchObject({ file: path('twice'), lineIndex: line })
            //the squiggle covers the token the Core points at, read from that unit's tokens
            expect([error.column, error.endColumn]).toEqual([1, 1 + 'bogus'.length])
        } finally {
            emulator.dispose()
        }
        //the live check says the same, and counts the units the program needs as checked
        const analysis = analyzeMarsProject(broken, 'linking', 1, language)
        expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([
            expect.objectContaining({ location: expect.objectContaining({ path: path('twice') }) }),
            expect.objectContaining({ location: expect.objectContaining({ path: path('twice') }) })
        ])
        expect(analysis.fileStatus[path('twice')]).toBe('assembled')
        expect(analysis.fileStatus[path('unused')]).toBe('not-reachable')
    })

    it('never assembles a unit the program does not need, so its mistake fails nothing', async () => {
        const broken = sources(path('main'), { unused: outputs.unused + asm.mistake }).sources
        const emulator = await build(broken)
        try {
            expect(errors(emulator)).toEqual([])
            expect(
                emulator.compilerDiagnostics
                    .filter((d) => d.code === 'not-linked')
                    .map((d) => d.file)
                    .sort()
            ).toEqual([path('other'), path('unused')])
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: RESULT })
        } finally {
            emulator.dispose()
        }
        const analysis = analyzeMarsProject(broken, 'linking', 1, language)
        expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(analysis.fileStatus[path('unused')]).toBe('not-reachable')
        expect(analysis.fileStatus[path('twice')]).toBe('assembled')
    })

    it('assembles again only the unit that changed, and never runs an old parse', async () => {
        const makeCore: MarsCoreFactory<MarsCheckCore & { getAssembledUnits(): string[] }> = (
            files,
            entry,
            profile,
            link
        ) =>
            language === 'MIPS'
                ? makeMipsCore(files, entry, profile, link)
                : makeRiscVCore(files, entry, profile, false, link)
        const assembled = (input: BuildSources) =>
            checkMarsProgram(input, language, {
                makeCore,
                display: undefined
            }).core.getAssembledUnits()
        const first = sources().sources
        //a unit the program does not need is not even parsed
        expect(assembled(first)).not.toContain(path('unused'))
        expect(assembled(first)).toEqual([])
        const doubled =
            language === 'MIPS'
                ? asm.twice.replace('.word\t1000', '.word\t1500')
                : asm.twice.replace('.word\t1000', '.word\t1500')
        const changed = sources(path('main'), { twice: doubled }).sources
        expect(assembled(changed)).toEqual([path('twice')])
        const emulator = await build(changed)
        try {
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: RESULT + 500 })
        } finally {
            emulator.dispose()
        }
        expect(assembled(first)).toEqual([path('twice')])
    })
})

/**
 * Hand-written assembly Files beside a C Program ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md),
 * decision 10): one joins the Build only when the program needs a global it declares, and must then
 * be GNU assembly; one it does not need, an exercise in MARS's or RARS's own dialect with mistakes
 * among them, is never assembled, and gets the Hint that it is not part of the program.
 */
const HAND = {
    'RISC-V': {
        main: '\t.text\n\t.globl\tmain\n\t.p2align\t2\nmain:\n\taddi\tsp, sp, -16\n\tsw\tra, 12(sp)\n\tli\ta0, 14\n\tcall\ttriple\n\tlw\tra, 12(sp)\n\taddi\tsp, sp, 16\n\tret\n',
        triple: '# triple(x), written by hand in GNU syntax\n\t.text\n\t.globl\ttriple\ntriple:\n\tslli\tt0, a0, 1\n\tadd\ta0, a0, t0\n\tret\n',
        dialect:
            "# triple(x) in RARS's own syntax\n.eqv FACTOR, 3\n.text\n.globl triple\ntriple:\n\tli t0, FACTOR\n\tmul a0, a0, t0\n\tret\n",
        exercise:
            '.data\nprompt: .asciz "Number? "\n.eqv PRINT_STRING, 4\n.text\n.globl main\nmain:\n\tli a7, PRINT_STRING\n\tla a0, prompt\n\tecall\n\tthis line is wrong\n',
        dialectName: "RARS's"
    },
    MIPS: {
        main: '\t.text\n\t.globl\tmain\nmain:\n\taddiu\t$sp,$sp,-24\n\tsw\t$31,20($sp)\n\tli\t$4,14\n\tjal\ttriple\n\tlw\t$31,20($sp)\n\taddiu\t$sp,$sp,24\n\tjr\t$31\n',
        triple: '# triple(x), written by hand in GNU syntax\n\t.text\n\t.globl\ttriple\ntriple:\n\tsll\t$2,$4,1\n\taddu\t$2,$2,$4\n\tjr\t$31\n',
        dialect:
            "# triple(x) in MARS's own syntax\n.eqv FACTOR 3\n.text\n.globl triple\ntriple:\n\tmul $v0, $a0, FACTOR\n\tjr $ra\n",
        exercise:
            '.data\nprompt: .asciiz "Number? "\n.eqv PRINT_STRING 4\n.text\n.globl main\nmain:\n\tli $v0, PRINT_STRING\n\tla $a0, prompt\n\tsyscall\n\tthis line is wrong\n',
        dialectName: "MARS's"
    }
}

describe.each(TARGETS)('$language: hand-written Files beside a C Program', (spec) => {
    const { language, extension, make } = spec
    const hand = HAND[language]
    const entry = `main.c.${extension}`
    const helper = `triple.${extension}`
    function sources(files: Record<string, string>, settings = {}) {
        const projectFiles: Record<string, ReturnType<typeof text>> = {
            'main.c': text('int triple(int);\nint main(void) { return triple(14); }\n'),
            [entry]: text(hand.main)
        }
        for (const [path, content] of Object.entries(files)) projectFiles[path] = text(content)
        const compilations: CompilationRecord[] = [
            {
                sourcePath: 'main.c',
                outputPath: entry,
                target: language,
                language: 'c',
                compilerId: 'test',
                optimization: '0',
                inputs: { 'main.c': fileFingerprint(projectFiles['main.c'])! },
                outputFingerprint: fileFingerprint(projectFiles[entry])!,
                assemblerProfile: 'gnu-compiler-v1',
                runtimeAbi: 'v1'
            }
        ]
        return projectBuildSources({
            files: projectFiles,
            entry,
            language,
            compilations,
            settings,
            programs: [entry, 'game/main.s']
        })
    }
    async function build(input: BuildSources) {
        const emulator = make(input, { language })
        await emulator.check()
        await emulator.compile(200_000, input)
        return emulator
    }
    const errors = (emulator: { compilerDiagnostics: readonly Diagnostic[] }) =>
        emulator.compilerDiagnostics.filter((d) => d.severity === 'error')
    const hints = (emulator: { compilerDiagnostics: readonly Diagnostic[] }) =>
        emulator.compilerDiagnostics
            .filter((d) => d.code === 'not-linked')
            .map((d) => d.file)
            .sort()

    it(`calls a function written by hand in GNU syntax, in a .${extension} File`, async () => {
        const input = sources({ [helper]: hand.triple })
        expect(input.linkUnits).toEqual([helper])
        const emulator = await build(input)
        try {
            expect(errors(emulator)).toEqual([])
            expect(hints(emulator)).toEqual([])
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: 42 })
            //the File is the program's own code, as a compiled unit's is
            expect(emulator.buildArtifacts.some((a) => a.file === helper)).toBe(true)
        } finally {
            emulator.dispose()
        }
        //a File it includes is part of it, though a unit of its own by name, and no Hint says
        //otherwise
        const split = sources({
            [helper]: `.include "parts/body.s"\n`,
            'parts/body.s': hand.triple
        })
        expect(split.linkUnits).toEqual(['parts/body.s', helper])
        const including = await build(split)
        try {
            expect(errors(including)).toEqual([])
            expect(hints(including)).toEqual([])
            await including.run(1_000_000)
            expect(including.termination).toEqual({ kind: 'exit', code: 42 })
        } finally {
            including.dispose()
        }
    })

    it("leaves out an exercise in the Core's own dialect, with mistakes, that the program does not need", async () => {
        const input = sources({ [helper]: hand.triple, 'exercise.asm': hand.exercise })
        expect(input.linkUnits).toEqual(['exercise.asm', helper])
        const emulator = await build(input)
        try {
            expect(errors(emulator)).toEqual([])
            //the Hint that says it is not part of the program, on its first line
            const [hint] = emulator.compilerDiagnostics.filter((d) => d.code === 'not-linked')
            expect(hint).toMatchObject({
                file: 'exercise.asm',
                severity: 'suggestion',
                lineIndex: 0,
                message: "The program doesn't use this File, so it is left out."
            })
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: 42 })
        } finally {
            emulator.dispose()
        }
        //the live check says the same, and does not count it as checked
        const analysis = analyzeMarsProject(input, 'hand-written', 1, language)
        expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(analysis.diagnostics.filter((d) => d.code === 'not-linked')).toEqual([
            expect.objectContaining({ location: expect.objectContaining({ path: 'exercise.asm' }) })
        ])
        expect(analysis.fileStatus['exercise.asm']).toBe('not-reachable')
        expect(analysis.fileStatus[helper]).toBe('assembled')
    })

    it(`fails a needed File in ${HAND[language].dialectName} own dialect, saying it must be GNU syntax`, async () => {
        const input = sources({ [helper]: hand.dialect })
        const emulator = make(input, { language })
        try {
            await expect(emulator.compile(200, input)).rejects.toThrow()
            const [why, ...rest] = errors(emulator)
            expect(why).toMatchObject({
                file: helper,
                lineIndex: hand.dialect.split('\n').indexOf('.globl triple'),
                message: `${helper} is linked into this program because it defines triple, which the program uses. This program is assembled as GNU assembly, the syntax C compiles to, so ${helper} must be written in GNU syntax too, not in ${hand.dialectName}.`
            })
            expect(rest.length).toBeGreaterThan(0)
            expect(rest.every((error) => error.file === helper)).toBe(true)
            expect(hints(emulator)).toEqual([])
        } finally {
            emulator.dispose()
        }
    })

    it("never takes another Program's Entry, nor the Files it includes, though they define what is needed", async () => {
        //game/main.s is a Program of its own, which includes its triple
        const input = sources({
            'game/main.s': '.include "triple.s"\n.text\n.globl main\nmain:\n',
            'game/triple.s': hand.triple
        })
        expect(input.linkUnits).toBeUndefined()
        const emulator = make(input, { language })
        try {
            await expect(emulator.compile(200, input)).rejects.toThrow()
            expect(errors(emulator).map((error) => error.message)).toContain(
                'Unresolved symbol: triple'
            )
        } finally {
            emulator.dispose()
        }
    })

    it('links a hand-written Entry in its own dialect alone, as before', () => {
        const input = projectBuildSources({
            files: { 'main.s': text('main:\n'), [helper]: text(hand.triple) },
            entry: 'main.s',
            language
        })
        expect(input.assemblerProfile).not.toBe('gnu-compiler-v1')
        expect(input.linkUnits).toBeUndefined()
    })
})

/**
 * A MIPS exception handler sits at 0x80000180, where the processor enters it, so the program never
 * names it: a File holding `.ktext` joins a C Program, as any File does, only when the program uses
 * a global it defines, which `<sim.h>`'s `SIM_LINK` does with a `.globl` of the handler's name. A
 * File the program does not use changes nothing, however many hold `.ktext`; two the link takes
 * cannot both, since a program has room for one handler ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md),
 * decisions 10 and 12).
 */
describe('MIPS: an exception handler beside a C Program', () => {
    const language = 'MIPS' as const
    const entry = 'main.c.mips'
    //main breaks, which only a handler gets past, and returns what $2 holds then
    const main = '\t.text\n\t.globl\tmain\nmain:\n\tli\t$2,1\n\tbreak\n\tjr\t$31\n'
    //what `SIM_LINK(handler);` adds to the Generated assembly
    const linked = '#APP\n\t.globl\thandler\n#NO_APP\n' + main
    const handler =
        '# skips the break and sets the result\n\t.globl\thandler\n\t.ktext\nhandler:\n\tmfc0\t$26,$14\n\taddiu\t$26,$26,4\n\tmtc0\t$26,$14\n\tli\t$2,42\n\teret\n'
    //a MARS keyboard lab, in MARS's own syntax, whose handler nothing names
    const lab =
        '# a MARS interrupt lab\n\t.text\nloop:\tj loop\n\t.ktext 0x80000180\n\tmfc0 $k0, $13\n\tlw $t0, 0xffff0004\n\teret\n'
    function sources(files: Record<string, string>, generated = main) {
        const projectFiles: Record<string, ReturnType<typeof text>> = {
            'main.c': text('int main(void) { __builtin_trap(); }\n'),
            [entry]: text(generated)
        }
        for (const [path, content] of Object.entries(files)) projectFiles[path] = text(content)
        const compilations: CompilationRecord[] = [
            {
                sourcePath: 'main.c',
                outputPath: entry,
                target: language,
                language: 'c',
                compilerId: 'test',
                optimization: '0',
                inputs: { 'main.c': fileFingerprint(projectFiles['main.c'])! },
                outputFingerprint: fileFingerprint(projectFiles[entry])!,
                assemblerProfile: 'gnu-compiler-v1',
                runtimeAbi: 'v1'
            }
        ]
        return projectBuildSources({ files: projectFiles, entry, language, compilations })
    }
    const errors = (emulator: { compilerDiagnostics: readonly Diagnostic[] }) =>
        emulator.compilerDiagnostics.filter((d) => d.severity === 'error')

    it('links a File holding .ktext that the program names with SIM_LINK, and the program gets past its break', async () => {
        const input = sources({ 'handler.mips': handler }, linked)
        expect(input.linkUnits).toEqual(['handler.mips'])
        const emulator = MIPSEmulator(input, { language })
        try {
            await emulator.check()
            await emulator.compile(200_000, input)
            expect(errors(emulator)).toEqual([])
            expect(emulator.compilerDiagnostics.filter((d) => d.code === 'not-linked')).toEqual([])
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: 42 })
        } finally {
            emulator.dispose()
        }
    })

    it('leaves out Files holding .ktext that the program does not use, so its faults still stop it', async () => {
        //a handler nothing names, and two MARS labs, which used to clash with each other
        const input = sources({ 'handler.mips': handler, 'lab.asm': lab, 'lab2.asm': lab })
        const emulator = MIPSEmulator(input, { language })
        try {
            await emulator.check()
            await emulator.compile(200_000, input)
            expect(errors(emulator)).toEqual([])
            expect(
                emulator.compilerDiagnostics
                    .filter((d) => d.code === 'not-linked')
                    .map((d) => d.file)
                    .sort()
            ).toEqual(['handler.mips', 'lab.asm', 'lab2.asm'])
            //each says its handler never runs, and how to include it: by its global name, or by
            //giving the lab's, which has none, one
            const hint = (file: string) =>
                emulator.compilerDiagnostics.find((d) => d.code === 'not-linked' && d.file === file)
                    ?.message
            expect(hint('handler.mips')).toBe(
                "The program doesn't use this File, so it is left out. Its exception handler never runs. To include it, write `SIM_LINK(handler);` in one of your C files, outside any function."
            )
            expect(hint('lab.asm')).toBe(
                "The program doesn't use this File, so it is left out. Its exception handler never runs. To include it, give the handler a name with `.globl`, then write `SIM_LINK(that_name);` in one of your C files, outside any function."
            )
            await emulator.run(1_000_000)
            expect(emulator.termination?.kind).toBe('error')
        } finally {
            emulator.dispose()
        }
    })

    it('fails two linked Files holding .ktext, since a program has room for one handler', async () => {
        const second = '# another handler\n\t.globl\tsecond\n\t.ktext\nsecond:\n\teret\n'
        const input = sources(
            { 'a/handler.mips': handler, 'b/second.mips': second },
            linked.replace('.globl\thandler', '.globl\thandler, second')
        )
        const emulator = MIPSEmulator(input, { language })
        try {
            await expect(emulator.compile(200, input)).rejects.toThrow()
            expect(errors(emulator)).toContainEqual(
                expect.objectContaining({
                    file: 'b/second.mips',
                    lineIndex: 4,
                    message:
                        'handler.mips and second.mips both hold .ktext, an exception handler, and a program has room for one, at 0x80000180, where MIPS enters it: keep the handler in one of them.'
                })
            )
        } finally {
            emulator.dispose()
        }
    })
})

describe('RISC-V: a hand-written Entry with the GNU profile', () => {
    it('takes the hand-written Files it needs, as a C Program does', async () => {
        const input = projectBuildSources({
            files: {
                'main.s': text(
                    '.text\n.globl main\nmain:\n\tli a0, 14\n\tcall triple\n\tli a7, 93\n\tecall\n'
                ),
                'triple.riscv': text(HAND['RISC-V'].triple),
                'exercise.asm': text(HAND['RISC-V'].exercise)
            },
            entry: 'main.s',
            language: 'RISC-V',
            settings: { riscvAssemblerProfile: 'gnu-compiler-v1' }
        })
        expect(input.linkUnits).toEqual(['exercise.asm', 'triple.riscv'])
        const emulator = RISCVEmulator(input, { language: 'RISC-V' })
        try {
            await emulator.check()
            await emulator.compile(200_000, input)
            expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
            await emulator.run(1_000_000)
            expect(emulator.termination).toEqual({ kind: 'exit', code: 42 })
        } finally {
            emulator.dispose()
        }
    })
})
