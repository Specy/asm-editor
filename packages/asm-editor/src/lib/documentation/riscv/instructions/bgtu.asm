# First bgtu case is taken; second is not. t2 ends at 11 (10 + 1).
.text
li t2, 0
li t0, 7
li t1, 3
bgtu t0, t1, taken
addi t2, t2, 1
j first_done # Skip the other marker unconditionally.
taken:
addi t2, t2, 10
first_done:
li t0, 3
li t1, 7
bgtu t0, t1, missed
addi t2, t2, 1
j second_done # Skip the other marker unconditionally.
missed:
addi t2, t2, 10
second_done:
# t2=11 proves one taken and one untaken path.
