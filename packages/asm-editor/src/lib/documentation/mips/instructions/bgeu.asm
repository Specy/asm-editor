# Compare unsigned operands with bgeu; the first case is taken and the second falls through. $t2=2 marks taken; $t3=1 marks fall-through.
li $t0, -2
li $t1, 1
li $t2, 0
bgeu $t0, $t1, taken_one
li $t2, 1
b first_done # Skip the other marker unconditionally.
 taken_one: li $t2, 2
first_done:
li $t0, 0
li $t1, 1
li $t3, 0
bgeu $t0, $t1, taken_two
li $t3, 1
b second_done # Skip the other marker unconditionally.
 taken_two: li $t3, 2
second_done:
