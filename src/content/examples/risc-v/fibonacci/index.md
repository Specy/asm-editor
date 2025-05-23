```riscv|playground|allow-open|large|tall|memory|console
.data
prompt_msg:   .string "Enter a non-negative integer n: "
result_msg:   .string "Fibonacci(n) is: "
newline_char: .string "\n"

.text
.globl _start

# Program entry point
_start:
    # --- Prompt for n ---
    li a7, 4              # syscall code for print_string
    la a0, prompt_msg     # load address of prompt_msg into a0
    ecall                 # make the syscall

    # --- Read integer n ---
    li a7, 5              # syscall code for read_integer
    ecall                 # make the syscall, integer read is in a0

    # --- Call fibonacci function ---
    # n is already in a0, which is the first argument register.
    jal ra, fib           # jump and link to fib function.
    mv s1, a0             # Save fib_result (from a0) to s1.

    # --- Print result message "Fibonacci(n) is: " ---
    li a7, 4              # syscall code for print_string
    la a0, result_msg     # load address of result_msg
    ecall

    # --- Print the calculated Fibonacci number ---
    li a7, 1              # syscall code for print_integer
    mv a0, s1             # move the fib_result (from s1) to a0 for printing
    ecall

    # --- Print newline character ---
    li a7, 4              # syscall code for print_string
    la a0, newline_char   # load address of newline_char
    ecall

    # --- Exit program ---
    li a7, 10             # syscall code for exit
    ecall

# Fibonacci function (Recursive Implementation)
# Calculates the nth Fibonacci number recursively.
# Input: a0 = n (a non-negative integer)
# Output: a0 = Fib(n)
#
# This function uses the stack to save the return address (ra) and
# callee-saved registers (s0, s1) that need to be preserved across
# recursive calls.
#
# Stack Frame:
# sp + 8  -> Saved ra
# sp + 4  -> Saved s0 (holds original n for fib(n-2) call)
# sp + 0  -> Saved s1 (holds result of fib(n-1) call)
fib:
    # Prologue: Save ra, s0, s1 on the stack
    # Allocate 12 bytes on the stack for 3 registers (ra, s0, s1)
    addi sp, sp, -12
    sw ra, 8(sp)          # Save return address (ra)
    sw s0, 4(sp)          # Save s0 (will be used to store original n)
    sw s1, 0(sp)          # Save s1 (will be used to store fib(n-1) result)

    # Base Cases:
    # If n == 0, return 0
    li t0, 0              # Load 0 into t0
    beq a0, t0, fib_base_zero # If a0 (n) == 0, branch to fib_base_zero

    # If n == 1, return 1
    li t0, 1              # Load 1 into t0
    beq a0, t0, fib_base_one  # If a0 (n) == 1, branch to fib_base_one

    # Recursive Step: n > 1
    # Calculate Fib(n) = Fib(n-1) + Fib(n-2)

    # First recursive call: fib(n-1)
    mv s0, a0             # Save the current value of n (from a0) into s0.
                          # This is crucial because a0 will be modified for the recursive call.
    addi a0, a0, -1       # Set argument for next call: a0 = n - 1
    jal ra, fib           # Call fib(n-1) recursively.
                          # The result (Fib(n-1)) will be in a0 upon return.
    mv s1, a0             # Save the result of fib(n-1) from a0 into s1.

    # Second recursive call: fib(n-2)
    mv a0, s0             # Restore the original n from s0 to a0.
                          # This is needed to calculate n-2 correctly.
    addi a0, a0, -2       # Set argument for next call: a0 = n - 2
    jal ra, fib           # Call fib(n-2) recursively.
                          # The result (Fib(n-2)) will be in a0 upon return.

    # Combine results
    add a0, s1, a0        # Add Fib(n-1) (from s1) and Fib(n-2) (from a0).
                          # Store the final result in a0.

    # Epilogue: Restore saved registers and stack pointer
    lw s1, 0(sp)          # Restore s1
    lw s0, 4(sp)          # Restore s0
    lw ra, 8(sp)          # Restore return address (ra)
    addi sp, sp, 12       # Deallocate stack space

    jr ra                 # Return to the caller

# Base case: n = 0
fib_base_zero:
    li a0, 0              # Set return value a0 to 0
    # Epilogue for base cases (same as main epilogue)
    lw s1, 0(sp)
    lw s0, 4(sp)
    lw ra, 8(sp)
    addi sp, sp, 12
    jr ra                 # Return

# Base case: n = 1
fib_base_one:
    li a0, 1              # Set return value a0 to 1
    # Epilogue for base cases (same as main epilogue)
    lw s1, 0(sp)
    lw s0, 4(sp)
    lw ra, 8(sp)
    addi sp, sp, 12
    jr ra                 # Return

```
