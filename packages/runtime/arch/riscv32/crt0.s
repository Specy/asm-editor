# Runtime library, ABI v1: program start for RV32 (RARS), in the GNU assembler syntax GCC emits.
# _start aligns sp to 16 bytes, calls every function pointer in .init_array (4 bytes each; the linker
# provides __init_array_start and __init_array_end), calls main(0, empty_argv) and passes its result to exit.
	.text
	.align	2
	.globl	_start
	.type	_start, @function
_start:
	andi	sp,sp,-16
	lui	s0,%hi(__init_array_start)
	addi	s0,s0,%lo(__init_array_start)
	lui	s1,%hi(__init_array_end)
	addi	s1,s1,%lo(__init_array_end)
.Linit:
	beq	s0,s1,.Lmain
	lw	t0,0(s0)
	addi	s0,s0,4
	jalr	t0
	j	.Linit
.Lmain:
	li	a0,0
	lui	a1,%hi(__aed_empty_argv)
	addi	a1,a1,%lo(__aed_empty_argv)
	mv	a2,a1
	call	main
	call	exit
	.size	_start, .-_start

	.section .rodata
	.align 2
__aed_empty_argv:
	.word 0
