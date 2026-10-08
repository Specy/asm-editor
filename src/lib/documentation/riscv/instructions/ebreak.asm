# ebreak pauses with a breakpoint; t0 stays 7 and the following li has not run.
.text
li t0, 7
ebreak
li t0, 99
