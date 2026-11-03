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
        //Generated assembly of another Target is no unit of this one
        const elsewhere = projectBuildSources({
            files,
            entry: path('main'),
            language,
            compilations: compilations.map((record) =>
                record.outputPath === path('twice')
                    ? { ...record, target: language === 'MIPS' ? 'RISC-V' : 'MIPS' }
                    : record
            )
        })
        expect(elsewhere.linkUnits).not.toContain(path('twice'))
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
            //the two units nothing needs were checked, and say why they are left out
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

    it("reports a mistake in another unit in that unit's File, used or not", async () => {
        for (const name of ['twice', 'unused'] as const) {
            const broken = sources(path('main'), { [name]: outputs[name] + asm.mistake }).sources
            const emulator = make(broken, { language })
            try {
                await expect(emulator.compile(200, broken)).rejects.toThrow()
                const [error] = errors(emulator)
                const line = (outputs[name] + asm.mistake).split('\n').length - 2
                expect(error).toMatchObject({ file: path(name), lineIndex: line })
                //the squiggle covers the token the Core points at, read from that unit's tokens
                expect([error.column, error.endColumn]).toEqual([1, 1 + 'bogus'.length])
            } finally {
                emulator.dispose()
            }
            //the live check says the same, and counts every unit as checked
            const analysis = analyzeMarsProject(broken, 'linking', 1, language)
            expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([
                expect.objectContaining({
                    location: expect.objectContaining({ path: path(name) })
                })
            ])
            expect(analysis.fileStatus[path('unused')]).toBe('assembled')
            expect(analysis.fileStatus[path('twice')]).toBe('assembled')
        }
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
        assembled(first)
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
