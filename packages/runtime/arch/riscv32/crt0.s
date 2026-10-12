# Runtime library, ABI v1: program start for RV32 (RARS), in the GNU assembler syntax GCC emits.
# _start keeps argc (a0) and argv (a1), which the Core sets before the first instruction (argv[0] is the
# program's name; a NULL argv, from a host that passes none, becomes argc 0 and a { NULL } array), aligns sp to
# 16 bytes, calls every function pointer in .init_array (4 bytes each; the linker provides
# __init_array_start and __init_array_end), calls main(argc, argv, empty_envp) and passes its result to exit.
	.text
	.align	2
	.globl	_start
	.type	_start, @function
_start:
	mv	s2,a0
	mv	s3,a1
	bne	s3,zero,.Largv
	li	s2,0
	lui	s3,%hi(__aed_empty_argv)
	addi	s3,s3,%lo(__aed_empty_argv)
.Largv:
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
	mv	a0,s2
	mv	a1,s3
	lui	a2,%hi(__aed_empty_argv)
	addi	a2,a2,%lo(__aed_empty_argv)
	call	main
	call	exit
	.size	_start, .-_start

	.section .rodata
	.align 2
__aed_empty_argv:
	.word 0
