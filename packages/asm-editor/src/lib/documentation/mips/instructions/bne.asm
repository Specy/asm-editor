# Run bne with one true and one false condition. A taken branch skips the assignment of 1; inspect $t2=2 for taken and $t3=1 for fall-through.
li $t0, 2
li $t1, 9
li $t2, 0
bne $t0, $t1, taken_one
li $t2, 1
b first_done # Skip the other marker unconditionally.
 taken_one: li $t2, 2
first_done:
li $t0, 2
li $t1, 2
li $t3, 0
bne $t0, $t1, taken_two
li $t3, 1
b second_done # Skip the other marker unconditionally.
 taken_two: li $t3, 2
second_done:
