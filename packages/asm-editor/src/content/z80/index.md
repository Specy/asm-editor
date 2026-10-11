This course is about the Zilog Z80, and about writing programs for it.

If you have never written assembly before, read
[Assembly basics](/learn/courses/assembly-basics) first. It covers registers, memory, branching, the
stack and the rest once and quickly, to give you the ideas. This course takes all of that for
granted and goes over the same ground again in much more depth, on one machine.

The Z80 is an 8 bit CPU. Its registers hold one byte each, they pair up into 16 bit registers when an
address is needed, and a value too big for a register is the ordinary case here, not the exception.
