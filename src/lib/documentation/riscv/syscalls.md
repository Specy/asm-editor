## Making a syscall

RISC-V syscalls are used to make requests to the operating system. They are not instructions that are executed by the CPU, but rather instructions that are used by the simulator to make requests to the operating system.

Each syscall has a unique code that is used to identify it. You must put the syscall code inside the `a7` register before calling the `ecall` instruction. As an example:

```riscv
# Load the integer 42 into register a0, which is
# the register that will be printed by the syscall
li a0, 42
# Set the syscall code for printing an integer
li a7, 1
ecall
```
