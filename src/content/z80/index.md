This course is about one machine, the Zilog Z80, and about writing programs for it in the editor you
are reading this in.

If you have never written assembly before, read
[Assembly basics](/learn/courses/assembly-basics) first. It covers registers, memory, branching, the
stack and the rest once and quickly, using whichever language made each point clearest. This course
takes all of that for granted and goes over the same topics again in more depth, in Z80 only.

The Z80 is an 8 bit CPU. Its registers hold one byte each, they pair up into 16 bit registers when an
address is needed, and a value too big for a register is the ordinary case here, not the exception.
