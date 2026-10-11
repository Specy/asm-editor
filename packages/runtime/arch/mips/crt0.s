# Runtime library, ABI v1: program start for MIPS32 o32 (MARS, little-endian), in the GNU assembler syntax GCC
# emits with -fno-delayed-branch: .set noreorder with an explicit nop in every delay slot, so it runs the same
# whether or not delayed branching is enabled.
# _start aligns $sp to 16 bytes and reserves the 16-byte argument area o32 callers provide, calls every
# function pointer in .init_array (4 bytes each; the linker provides __init_array_start and __init_array_end),
# calls main(0, empty_argv) and passes its result to exit.
	.text
	.align	2
	.globl	_start
	.set	nomips16
	.set	nomicromips
	.ent	_start
	.type	_start, @function
_start:
	.set	noreorder
	.set	nomacro
	li	$2,-16
	and	$sp,$sp,$2
	addiu	$sp,$sp,-16
	lui	$16,%hi(__init_array_start)
	addiu	$16,$16,%lo(__init_array_start)
	lui	$17,%hi(__init_array_end)
	addiu	$17,$17,%lo(__init_array_end)
$Linit:
	beq	$16,$17,$Lmain
	nop
	lw	$2,0($16)
	addiu	$16,$16,4
	jalr	$2
	nop
	b	$Linit
	nop
$Lmain:
	move	$4,$0
	lui	$5,%hi(__aed_empty_argv)
	addiu	$5,$5,%lo(__aed_empty_argv)
	move	$6,$5
	jal	main
	nop
	move	$4,$2
	jal	exit
	nop
	.set	macro
	.set	reorder
	.end	_start
	.size	_start, .-_start

	.section .rodata
	.align 2
__aed_empty_argv:
	.word 0
