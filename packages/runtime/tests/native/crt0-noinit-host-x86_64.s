# Test start file: calls main(0, empty_argv) and ends with the raw exit_group system call. It runs no .init_array entry
# and never calls exit(), like a bare assembly program that calls library functions: output must already have
# been written and no library function may depend on initialization.
	.text
	.globl	_start
	.type	_start, @function
_start:
	andq	$-16, %rsp
	xorl	%edi, %edi
	leaq __aed_empty_argv(%rip), %rsi
	call	main
	movl	%eax, %edi
	movl	$231, %eax
	syscall
	hlt
	.size	_start, .-_start
	.section	.note.GNU-stack,"",@progbits

.section .rodata
.align 8
__aed_empty_argv:
.quad 0
