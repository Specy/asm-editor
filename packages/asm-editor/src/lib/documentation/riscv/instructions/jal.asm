# jal saves the next instruction address (0x00400008) in ra. link_marker is that skipped instruction; t2 ends at 1.
.text
li t2, 0
jal ra, done
link_marker:
addi t2, t2, 100
done:
addi t2, t2, 1
