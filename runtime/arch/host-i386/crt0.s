# Runtime library: program start for native testing on i386 Linux (AT&T syntax). Same contract as the Targets'
# crt0: align the stack to 16 bytes, call every .init_array entry (4 bytes each), call main(0, NULL), then exit.
	.text
	.globl	_start
	.type	_start, @function
_start:
	xorl	%ebp, %ebp
	andl	$-16, %esp
	movl	$__init_array_start, %ebx
.Linit:
	cmpl	$__init_array_end, %ebx
	je	.Lmain
	call	*(%ebx)
	addl	$4, %ebx
	jmp	.Linit
.Lmain:
	subl	$8, %esp
	pushl	$0
	pushl	$0
	call	main
	addl	$16, %esp
	subl	$12, %esp
	pushl	%eax
	call	exit
	hlt
	.size	_start, .-_start
	.section	.note.GNU-stack,"",@progbits
