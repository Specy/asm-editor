# Test start file: calls main(0, NULL) and ends with the raw exit_group system call. It runs no .init_array entry
# and never calls exit(), like a bare assembly program that calls library functions: output must already have
# been written and no library function may depend on initialization.
	.text
	.globl	_start
	.type	_start, @function
_start:
	andq	$-16, %rsp
	xorl	%edi, %edi
	xorl	%esi, %esi
	call	main
	movl	%eax, %edi
	movl	$231, %eax
	syscall
	hlt
	.size	_start, .-_start
	.section	.note.GNU-stack,"",@progbits
