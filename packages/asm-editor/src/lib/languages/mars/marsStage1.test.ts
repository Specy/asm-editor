import { afterEach, describe, expect, it } from 'vite-plus/test'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
import { projectBuildSources } from '#lib/buildSources.ts'
import type { BuildSources, ProjectFiles } from '#lib/projectFiles.ts'
import { fileFingerprint, type CompilationRecord } from '#lib/sourceCompilation/records.ts'

/**
 * The three MIPS/RISC-V features of asmOS's stage 1 together, against the real Cores and the real
 * Runtime library: a Program of two compiled units ([asmOS portability](../../../../../../docs/design/asmos-portability.md),
 * decision 11) that reads the [Input controller](../../../../../../docs/design/input-controller.md)
 * through `<sim.h>`, one whose other unit lists a folder with the [folder calls](../../../../../../docs/design/folder-calls.md)'
 * POSIX functions, and one assembly program that makes a folder call and reads the Input controller
 * in the same run, which Undo takes back together. The Generated assembly is hand-written the way
 * Clang and GCC write it, with `# @N` marking each instruction's C line.
 */

const C = {
    inputMain: `#include <sim.h>
int read_keys(void);
int main(void) {
    if (!sim_input_present()) return 1;
    return read_keys() + (int)sim_input_pending();
}
`,
    inputKeys: `#include <sim.h>
int read_keys(void) {
    int total = 0;
    while (sim_input_pending()) {
        unsigned event = sim_input_event();
        if (SIM_INPUT_KIND(event) == SIM_INPUT_KEY_DOWN) total += SIM_INPUT_CODE(event);
        else if (SIM_INPUT_KIND(event) == SIM_INPUT_KEY_UP) total += 1000;
    }
    if (sim_input_key_down(SIM_KEY_ARROW_LEFT)) total += 10000;
    return total;
}
`,
    listMain: `int count_files(const char *path);
long file_size(const char *path);
int main(void) {
    return count_files("data") * 100 + (int)file_size("data/a.txt");
}
`,
    listFolder: `#include <dirent.h>
#include <sys/stat.h>
int count_files(const char *path) {
    DIR *dir = opendir(path);
    if (!dir) return -1;
    int n = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)) != 0)
        if (entry->d_type == DT_REG) n++;
    closedir(dir);
    return n;
}
long file_size(const char *path) {
    struct stat info;
    if (stat(path, &info) != 0) return -1;
    return (long)info.st_size;
}
`
}

/** KeyA down and up, then ArrowLeft down and held: 0x04 + 1000 + 0x50, and 10000 for the held key. */
const KEYS_RESULT = 4 + 1000 + 0x50 + 10000
/** Two Files directly in data/ (a folder beside them is no File), and data/a.txt's five bytes. */
const LIST_RESULT = 2 * 100 + 5

const RISCV = {
    inputMain: `	.text
	.file	"main.c"
	.globl	main
	.p2align	2
	.type	main,@function
main:
	addi	sp, sp, -16 # @3
	sw	ra, 12(sp) # @3
	sw	s0, 8(sp) # @3
	call	sim_input_present # @4
	bnez	a0, .LBB0_2 # @4
	li	a0, 1 # @4
	j	.LBB0_3 # @4
.LBB0_2:
	call	read_keys # @5
	mv	s0, a0 # @5
	call	sim_input_pending # @5
	add	a0, s0, a0 # @5
.LBB0_3:
	lw	s0, 8(sp) # @6
	lw	ra, 12(sp) # @6
	addi	sp, sp, 16 # @6
	ret # @6
.Lfunc_end0:
	.size	main, .Lfunc_end0-main
	.p2align	2
	.type	sim_input_present,@function
sim_input_present:
	lui	a0, 1048560
	lw	a0, 768(a0)
	srli	a0, a0, 8
	lui	a1, 1173
	addi	a1, a1, -432
	xor	a0, a0, a1
	seqz	a0, a0
	ret
.Lfunc_end1:
	.size	sim_input_present, .Lfunc_end1-sim_input_present
	.p2align	2
	.type	sim_input_pending,@function
sim_input_pending:
	lui	a0, 1048560
	lw	a0, 776(a0)
	andi	a0, a0, 127
	ret
.Lfunc_end2:
	.size	sim_input_pending, .Lfunc_end2-sim_input_pending
`,
    inputKeys: `	.text
	.file	"input.c"
	.globl	read_keys
	.p2align	2
	.type	read_keys,@function
read_keys:
	addi	sp, sp, -16 # @2
	sw	ra, 12(sp) # @2
	sw	s0, 8(sp) # @2
	li	s0, 0 # @3
	j	.LBB0_2 # @4
.LBB0_1:
	lui	a0, 1048560 # @5
	lw	a0, 780(a0) # @5
	srli	a1, a0, 8 # @6
	andi	a1, a1, 7 # @6
	li	a2, 1 # @6
	bne	a1, a2, .LBB0_3 # @6
	andi	a0, a0, 255 # @6
	add	s0, s0, a0 # @6
	j	.LBB0_2 # @6
.LBB0_3:
	li	a2, 2 # @7
	bne	a1, a2, .LBB0_2 # @7
	addi	s0, s0, 1000 # @7
.LBB0_2:
	call	sim_input_pending # @4
	bnez	a0, .LBB0_1 # @4
	lui	a0, 1048560 # @9
	lbu	a0, 810(a0) # @9
	andi	a0, a0, 1 # @9
	beqz	a0, .LBB0_5 # @9
	lui	a0, 2 # @9
	addi	a0, a0, 1808 # @9
	add	s0, s0, a0 # @9
.LBB0_5:
	mv	a0, s0 # @10
	lw	s0, 8(sp) # @11
	lw	ra, 12(sp) # @11
	addi	sp, sp, 16 # @11
	ret # @11
.Lfunc_end0:
	.size	read_keys, .Lfunc_end0-read_keys
	.p2align	2
	.type	sim_input_pending,@function
sim_input_pending:
	lui	a0, 1048560
	lw	a0, 776(a0)
	andi	a0, a0, 127
	ret
.Lfunc_end1:
	.size	sim_input_pending, .Lfunc_end1-sim_input_pending
`,
    listMain: `	.text
	.file	"main.c"
	.globl	main
	.p2align	2
	.type	main,@function
main:
	addi	sp, sp, -16 # @3
	sw	ra, 12(sp) # @3
	sw	s0, 8(sp) # @3
	lui	a0, %hi(.L.str) # @4
	addi	a0, a0, %lo(.L.str) # @4
	call	count_files # @4
	li	a1, 100 # @4
	mul	s0, a0, a1 # @4
	lui	a0, %hi(.L.str.1) # @4
	addi	a0, a0, %lo(.L.str.1) # @4
	call	file_size # @4
	add	a0, s0, a0 # @4
	lw	s0, 8(sp) # @5
	lw	ra, 12(sp) # @5
	addi	sp, sp, 16 # @5
	ret # @5
.Lfunc_end0:
	.size	main, .Lfunc_end0-main
	.type	.L.str,@object
	.section	.rodata.str1.1,"aMS",@progbits,1
.L.str:
	.asciz	"data"
	.size	.L.str, 5
	.type	.L.str.1,@object
.L.str.1:
	.asciz	"data/a.txt"
	.size	.L.str.1, 11
`,
    listFolder: `	.text
	.file	"list.c"
	.globl	count_files
	.p2align	2
	.type	count_files,@function
count_files:
	addi	sp, sp, -16 # @3
	sw	ra, 12(sp) # @3
	sw	s0, 8(sp) # @3
	sw	s1, 4(sp) # @3
	call	opendir # @4
	beqz	a0, .LBB0_4 # @5
	mv	s0, a0 # @4
	li	s1, 0 # @6
	j	.LBB0_3 # @8
.LBB0_2:
	lbu	a0, 18(a0) # @9
	li	a1, 8 # @9
	bne	a0, a1, .LBB0_3 # @9
	addi	s1, s1, 1 # @9
.LBB0_3:
	mv	a0, s0 # @8
	call	readdir # @8
	bnez	a0, .LBB0_2 # @8
	mv	a0, s0 # @10
	call	closedir # @10
	mv	a0, s1 # @11
	j	.LBB0_5 # @11
.LBB0_4:
	li	a0, -1 # @5
.LBB0_5:
	lw	ra, 12(sp) # @12
	lw	s0, 8(sp) # @12
	lw	s1, 4(sp) # @12
	addi	sp, sp, 16 # @12
	ret # @12
.Lfunc_end0:
	.size	count_files, .Lfunc_end0-count_files
	.globl	file_size
	.p2align	2
	.type	file_size,@function
file_size:
	addi	sp, sp, -128 # @13
	sw	ra, 124(sp) # @13
	mv	a1, sp # @15
	call	stat # @15
	bnez	a0, .LBB1_2 # @15
	lw	a0, 48(sp) # @16
	j	.LBB1_3 # @16
.LBB1_2:
	li	a0, -1 # @15
.LBB1_3:
	lw	ra, 124(sp) # @17
	addi	sp, sp, 128 # @17
	ret # @17
.Lfunc_end1:
	.size	file_size, .Lfunc_end1-file_size
`
}

const MIPS = {
    inputMain: `	.text
	.align	2
	.globl	main
	.type	main, @function
main:
	addiu	$sp,$sp,-32 # @3
	sw	$31,28($sp) # @3
	sw	$16,24($sp) # @3
	jal	sim_input_present # @4
	bne	$2,$0,$L2 # @4
	li	$2,1 # @4
	b	$L3 # @4
$L2:
	jal	read_keys # @5
	move	$16,$2 # @5
	jal	sim_input_pending # @5
	addu	$2,$16,$2 # @5
$L3:
	lw	$16,24($sp) # @6
	lw	$31,28($sp) # @6
	addiu	$sp,$sp,32 # @6
	jr	$31 # @6
	.size	main, .-main
	.align	2
	.type	sim_input_present, @function
sim_input_present:
	lui	$2,0xffff
	lw	$2,768($2)
	srl	$2,$2,8
	lui	$3,0x49
	ori	$3,$3,0x4e50
	xor	$2,$2,$3
	sltu	$2,$2,1
	jr	$31
	.size	sim_input_present, .-sim_input_present
	.align	2
	.type	sim_input_pending, @function
sim_input_pending:
	lui	$2,0xffff
	lw	$2,776($2)
	andi	$2,$2,0x7f
	jr	$31
	.size	sim_input_pending, .-sim_input_pending
`,
    inputKeys: `	.text
	.align	2
	.globl	read_keys
	.type	read_keys, @function
read_keys:
	addiu	$sp,$sp,-32 # @2
	sw	$31,28($sp) # @2
	sw	$16,24($sp) # @2
	move	$16,$0 # @3
	b	$L2 # @4
$L3:
	lui	$4,0xffff # @5
	lw	$4,780($4) # @5
	srl	$5,$4,8 # @6
	andi	$5,$5,0x7 # @6
	li	$6,1 # @6
	bne	$5,$6,$L4 # @6
	andi	$4,$4,0xff # @6
	addu	$16,$16,$4 # @6
	b	$L2 # @6
$L4:
	li	$6,2 # @7
	bne	$5,$6,$L2 # @7
	addiu	$16,$16,1000 # @7
$L2:
	jal	sim_input_pending # @4
	bne	$2,$0,$L3 # @4
	lui	$4,0xffff # @9
	lbu	$4,810($4) # @9
	andi	$4,$4,0x1 # @9
	beq	$4,$0,$L6 # @9
	addiu	$16,$16,10000 # @9
$L6:
	move	$2,$16 # @10
	lw	$16,24($sp) # @11
	lw	$31,28($sp) # @11
	addiu	$sp,$sp,32 # @11
	jr	$31 # @11
	.size	read_keys, .-read_keys
	.align	2
	.type	sim_input_pending, @function
sim_input_pending:
	lui	$2,0xffff
	lw	$2,776($2)
	andi	$2,$2,0x7f
	jr	$31
	.size	sim_input_pending, .-sim_input_pending
`,
    listMain: `	.text
	.align	2
	.globl	main
	.type	main, @function
main:
	addiu	$sp,$sp,-32 # @3
	sw	$31,28($sp) # @3
	sw	$16,24($sp) # @3
	lui	$4,%hi($LC0) # @4
	addiu	$4,$4,%lo($LC0) # @4
	jal	count_files # @4
	li	$3,100 # @4
	mul	$16,$2,$3 # @4
	lui	$4,%hi($LC1) # @4
	addiu	$4,$4,%lo($LC1) # @4
	jal	file_size # @4
	addu	$2,$16,$2 # @4
	lw	$16,24($sp) # @5
	lw	$31,28($sp) # @5
	addiu	$sp,$sp,32 # @5
	jr	$31 # @5
	.size	main, .-main
	.section	.rodata.str1.4,"aMS",@progbits,1
	.align	2
$LC0:
	.ascii	"data\\000"
	.align	2
$LC1:
	.ascii	"data/a.txt\\000"
`,
    listFolder: `	.text
	.align	2
	.globl	count_files
	.type	count_files, @function
count_files:
	addiu	$sp,$sp,-32 # @3
	sw	$31,28($sp) # @3
	sw	$17,24($sp) # @3
	sw	$16,20($sp) # @3
	jal	opendir # @4
	beq	$2,$0,$L5 # @5
	move	$16,$2 # @4
	move	$17,$0 # @6
	b	$L3 # @8
$L2:
	lbu	$3,18($2) # @9
	li	$4,8 # @9
	bne	$3,$4,$L3 # @9
	addiu	$17,$17,1 # @9
$L3:
	move	$4,$16 # @8
	jal	readdir # @8
	bne	$2,$0,$L2 # @8
	move	$4,$16 # @10
	jal	closedir # @10
	move	$2,$17 # @11
	b	$L6 # @11
$L5:
	li	$2,-1 # @5
$L6:
	lw	$31,28($sp) # @12
	lw	$17,24($sp) # @12
	lw	$16,20($sp) # @12
	addiu	$sp,$sp,32 # @12
	jr	$31 # @12
	.size	count_files, .-count_files
	.align	2
	.globl	file_size
	.type	file_size, @function
file_size:
	addiu	$sp,$sp,-136 # @13
	sw	$31,132($sp) # @13
	addiu	$5,$sp,16 # @15
	jal	stat # @15
	bne	$2,$0,$L8 # @15
	lw	$2,72($sp) # @16
	b	$L9 # @16
$L8:
	li	$2,-1 # @15
$L9:
	lw	$31,132($sp) # @17
	addiu	$sp,$sp,136 # @17
	jr	$31 # @17
	.size	file_size, .-file_size
`
}

const TARGETS = [
    { language: 'RISC-V' as const, extension: 'riscv', asm: RISCV, make: RISCVEmulator },
    { language: 'MIPS' as const, extension: 'mips', asm: MIPS, make: MIPSEmulator }
]

const text = (content: string) => ({ encoding: 'plain' as const, content })

type Emulator = ReturnType<typeof RISCVEmulator> | ReturnType<typeof MIPSEmulator>

describe.each(TARGETS)('$language: stage 1 features together', (spec) => {
    const { language, extension, asm, make } = spec
    const emulators: Emulator[] = []
    afterEach(() => {
        for (const emulator of emulators.splice(0)) emulator.dispose()
    })

    /** A Project of compiled units, `name.c` and its Generated assembly each, with the real library. */
    function program(units: Record<string, { c: string; asm: string }>, entry: string) {
        const files: Record<string, ReturnType<typeof text>> = {}
        const compilations: CompilationRecord[] = []
        for (const [name, unit] of Object.entries(units)) {
            const output = `${name}.c.${extension}`
            files[`${name}.c`] = text(unit.c)
            files[output] = text(unit.asm)
            compilations.push({
                sourcePath: `${name}.c`,
                outputPath: output,
                target: language,
                language: 'c',
                compilerId: 'test',
                optimization: '1',
                inputs: { [`${name}.c`]: fileFingerprint(files[`${name}.c`])! },
                outputFingerprint: fileFingerprint(files[output])!,
                assemblerProfile: 'gnu-compiler-v1',
                runtimeAbi: 'v1'
            })
        }
        return projectBuildSources({
            files: files as ProjectFiles,
            entry: `${entry}.c.${extension}`,
            language,
            compilations
        })
    }

    async function build(
        sources: BuildSources,
        peripherals: { keyboard?: Keyboard; fileSystem?: FileSystem } = {}
    ) {
        const emulator = make(sources, { language, peripherals })
        emulators.push(emulator)
        await emulator.check()
        await emulator.compile(200_000, sources)
        expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
        return emulator
    }

    it('reads the Input controller from a unit the Entry calls, each unit with its own static helpers', async () => {
        const sources = program(
            {
                main: { c: C.inputMain, asm: asm.inputMain },
                input: { c: C.inputKeys, asm: asm.inputKeys }
            },
            'main'
        )
        expect(sources.linkUnits).toEqual([`input.c.${extension}`])
        const keyboard = new Keyboard()
        const emulator = await build(sources, { keyboard })
        //the Build ran the start code to main; the first Step opens the Input controller
        expect(emulator.currentFile).toBe(`main.c.${extension}`)
        await emulator.step()
        keyboard.keyDown({ code: 'KeyA', key: 'a' })
        keyboard.keyUp({ code: 'KeyA', key: 'a' })
        keyboard.keyDown({ code: 'ArrowLeft', key: 'ArrowLeft' })
        await emulator.run(1_000_000)
        expect(emulator.errors).toEqual([])
        expect(emulator.termination).toEqual({ kind: 'exit', code: KEYS_RESULT })
        //both units' sim_input_pending, each in its own File
        const pending = emulator.programSymbols!.labels.filter(
            (label) => label.name === 'sim_input_pending'
        )
        expect(pending.map((label) => label.definition?.file).sort()).toEqual([
            `input.c.${extension}`,
            `main.c.${extension}`
        ])
    })

    it('steps from the Entry into the unit that reads the Input controller', async () => {
        const sources = program(
            {
                main: { c: C.inputMain, asm: asm.inputMain },
                input: { c: C.inputKeys, asm: asm.inputKeys }
            },
            'main'
        )
        const keyboard = new Keyboard()
        const emulator = await build(sources, { keyboard })
        await emulator.step()
        keyboard.keyDown({ code: 'KeyA', key: 'a' })
        for (let i = 0; i < 40 && emulator.currentFile !== `input.c.${extension}`; i++)
            await emulator.step()
        expect(emulator.currentFile).toBe(`input.c.${extension}`)
        await emulator.run(1_000_000)
        expect(emulator.termination).toEqual({ kind: 'exit', code: 4 })
        //Undo back into main takes the read back: the event is in the queue again
        for (let i = 0; i < 100 && emulator.canUndo; i++) emulator.undo(1)
        expect(emulator.currentFile).toBe(`main.c.${extension}`)
        const status = emulator.readMemoryBytes(0xffff0308n, 4)
        expect(status[0] & 0x7f).toBe(1)
    })

    it("lists a folder with opendir, readdir and stat from the Entry's other unit", async () => {
        const sources = program(
            {
                main: { c: C.listMain, asm: asm.listMain },
                list: { c: C.listFolder, asm: asm.listFolder }
            },
            'main'
        )
        expect(sources.linkUnits).toEqual([`list.c.${extension}`])
        const fileSystem = new FileSystem({
            'data/a.txt': text('hello'),
            'data/b.txt': text('xy'),
            'data/sub/c.txt': text('z'),
            'other.txt': text('not listed')
        })
        const emulator = await build(sources, { fileSystem })
        //the library members the other unit needs came in for it
        expect(Object.keys(emulator.buildLibraryFiles ?? {})).toEqual(
            expect.arrayContaining([
                '@runtime/v1/dirent/opendir.s',
                '@runtime/v1/dirent/readdir.s',
                '@runtime/v1/dirent/closedir.s',
                '@runtime/v1/stat/stat.s'
            ])
        )
        await emulator.run(5_000_000)
        expect(emulator.errors).toEqual([])
        expect(emulator.termination).toEqual({ kind: 'exit', code: LIST_RESULT })
        expect(emulator.buildArtifacts.some((a) => a.file === `list.c.${extension}`)).toBe(true)
    })

    it('makes a folder call and reads the Input controller in one run, which Undo takes back together', async () => {
        const mips = language === 'MIPS'
        const code = mips
            ? `.data
from: .asciiz "input.txt"
to: .asciiz "moved.txt"
.text
main:
    la $a0, from
    la $a1, to
    li $v0, 1034
    syscall
    move $s0, $v0
    lui $t0, 0xffff
    lw $s1, 780($t0)
    li $v0, 10
    syscall
`
            : `.data
from: .asciz "input.txt"
to: .asciz "moved.txt"
.text
main:
    la a0, from
    la a1, to
    li a7, 1034
    ecall
    mv s0, a0
    li t0, 0xffff0000
    lw s1, 780(t0)
    li a7, 10
    ecall
`
        const keyboard = new Keyboard()
        const fileSystem = new FileSystem({ 'input.txt': text('data') })
        const emulator = make(code, { language, peripherals: { keyboard, fileSystem } })
        emulators.push(emulator)
        await emulator.check()
        await emulator.compile(1000, code)
        await emulator.step()
        keyboard.keyDown({ code: 'KeyB', key: 'b' })
        await emulator.run(10_000)
        expect(emulator.errors).toEqual([])
        const value = (name: string) =>
            Number(emulator.registers.find((r) => r.name === name)?.value ?? -1n) >>> 0
        expect(value(mips ? '$s0' : 's0')).toBe(0)
        expect(value(mips ? '$s1' : 's1')).toBe((1 << 8) | 0x05)
        expect(Object.keys(fileSystem.files)).toEqual(['moved.txt'])
        emulator.undo(emulator.latestSteps.length)
        expect(Object.keys(fileSystem.files)).toEqual(['input.txt'])
        expect(emulator.readMemoryBytes(0xffff0308n, 4)[0] & 0x7f).toBe(1)
    })
})
