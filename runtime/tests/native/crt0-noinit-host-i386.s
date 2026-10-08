# Test start file: calls main(0, empty_argv) and ends with the raw exit_group system call. It runs no .init_array entry
# and never calls exit(), like a bare assembly program that calls library functions: output must already have
# been written and no library function may depend on initialization.
	.text
	.globl	_start
	.type	_start, @function
_start:
	andl	$-16, %esp
	subl	$8, %esp
	pushl	$__aed_empty_argv
	pushl	$0
	call	main
	movl	%eax, %ebx
	movl	$252, %eax
	int	$0x80
	hlt
	.size	_start, .-_start
	.section	.note.GNU-stack,"",@progbits

.section .rodata
.align 4
__aed_empty_argv:
.long 0
