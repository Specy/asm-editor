# Runtime library: program start for native testing on x86-64 Linux (AT&T syntax). Same contract as the Targets'
# crt0: align the stack to 16 bytes, call every .init_array entry (8 bytes each), call main(0, NULL), then exit.
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
	xorl	%esi, %esi
	call	main
	movl	%eax, %edi
	call	exit
	hlt
	.size	_start, .-_start
	.section	.note.GNU-stack,"",@progbits
