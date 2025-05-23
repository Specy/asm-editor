When the CPU executes operations, it keeps information about the outcome of each instruction in something called **flags**.
Each CPU has a different set of flags, but they usually follow similar patterns.

**Flags** are a way for the CPU to track the result of the **most recent operation**, and they are commonly used in **conditional instructions**
(e.g., _branch if zero_, _branch if negative_, etc.) to decide what to do next in the program.

Flags are stored in a special register inside the CPU, often called the **status register**, **condition code register (CCR)**, or **flags register**, depending on the architecture.

Here are some **common flags** you'll encounter in most CPU architectures:

- **Zero flag (Z)**: Set if the result of an operation is zero.
  Example: If you subtract two equal numbers, the result is zero, so the zero flag is set.

- **Negative flag (N)**: Set if the result of an operation is negative (usually if the highest bit is set in a signed value).
  Example: Subtracting a larger number from a smaller one.

- **Carry flag (C)**: Set if an operation results in a carry out of the most significant bit (used in unsigned arithmetic).
  Example: Adding two large numbers that overflow the size of the register.

- **Overflow flag (V or O)**: Set if the result of an operation caused a signed overflow (i.e., the result is too large or too small for the signed number range).

- **Sign flag (S)**: Sometimes used instead of or in addition to the Negative flag, depending on the architecture.

- **Parity flag (P)**: Set if the number of 1s in the result is even (used in some architectures like x86 for error checking).

---

These flags are typically **updated automatically** by the CPU after every arithmetic or logical operation.
For example, if you perform an `add` instruction, the CPU will update the **zero**, **carry**, and **overflow** flags based on the result.

Later instructions, like `branch if zero (BEQ)` or `branch if negative (BMI)`, can then check these flags to determine whether or not to change the flow of execution.

### Example:

```assembly
cmp d0, d1     ; Compare d0 with d1 (sets flags based on result)
beq equal      ; If result was zero (d0 == d1), jump to 'equal'
```

Here, the `cmp` instruction subtracts `d1` from `d0` and sets the flags based on the result, without storing the result anywhere.
Then `beq` checks the **zero flag**—if it's set, that means the values were equal, and the program jumps to the `equal` label.
