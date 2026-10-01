## The ones to start with {#common}

A program here runs as a Linux program, so everything outside its own memory happens through `syscall`. Put the call number in `rax`, the arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8` and `r9`, and read the result from `rax`. A result between -1 and -4095 is an error code. `rcx` and `r11` do not survive the call.

## Everything this emulator implements {#all}

Those syscalls are what the emulator implements, anything missing returns `-ENOSYS`.
