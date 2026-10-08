# jalr saves the next instruction address (0x00400010) in ra. link_marker is that skipped instruction; t2 ends at 1.
.text
li t2, 0
la t3, done
jalr ra, 0(t3)
link_marker:
addi t2, t2, 100
done:
addi t2, t2, 1
