We saw in the previous lecture that the syntax of an instruction is:
```
<instruction mnemonic> <operand1>, <operand2>, ...
```
Where operands can be registers, memory addresses, immediate values (a constant value), etc...
This different kinds of operands are called *addressing modes*, they determine how the CPU interprets the operands of an instruction.

Each CPU has its own set of addressing modes, and each assembly language has its own syntax for them. 
But it generally boils down to:
- **Immediate**: The operand is a constant value, for example a number, character, etc...
- **Register**: The operand is the name of a register, depending on the CPU architecture, this register addressing mode can be further divided, for example for address and data registers
- **Direct**: The operand is a memory address, represented by the number of the memory location. This can be either a constant value or a label. The assembler will replace the label with the actual address during assembly.
- **Indirect**: The operand is a memory address, but the address is stored in a register. This means that the CPU will first read the value of the register, and then use that value as the address to access memory.
- **Indexed**: The operand is a memory address, but the address is calculated by adding an offset to the value of a register. This means that the CPU will first read the value of the register, add the offset to it, and then use that value as the address to access memory.
- **Implicit**: The operand is implied by the instruction itself and does not need to be specified.
etc...

