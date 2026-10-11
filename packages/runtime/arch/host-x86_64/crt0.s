# Runtime library: program start for native testing on x86-64 Linux (AT&T syntax). Same contract as the Targets'
# crt0: align the stack to 16 bytes, call every .init_array entry (8 bytes each), call main(0, empty_argv), then exit.
	.text
	.globl	_start
	.type	_start, @function
_start:
	xorl	%ebp, %ebp
	andq	$-16, %rsp
	leaq	__init_array_start(%rip), %rbx
	leaq	__init_array_end(%rip), %r12
.Linit:
	cmpq	%r12, %rbx
	je	.Lmain
	call	*(%rbx)
	addq	$8, %rbx
	jmp	.Linit
.Lmain:
	xorl	%edi, %edi
	leaq	__aed_empty_argv(%rip), %rsi
	movq	%rsi, %rdx
	call	main
	movl	%eax, %edi
	call	exit
	hlt
	.size	_start, .-_start
	.section	.note.GNU-stack,"",@progbits

	.section .rodata
	.align 8
__aed_empty_argv:
	.quad 0
