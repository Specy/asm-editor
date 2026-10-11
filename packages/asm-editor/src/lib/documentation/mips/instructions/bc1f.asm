.data
less: .float 1.0
greater: .float 2.0
.text
# Compare 1.0 and 2.0, then the reverse. A taken branch skips the assignment of 1; inspect $t2/$t3 for markers 2 (taken) and 1 (fall-through).
l.s $f0, less
l.s $f2, greater
c.lt.s $f0, $f2
li $t2, 0
bc1f 0, first_taken
li $t2, 1
b first_done # Skip the other marker unconditionally.
first_taken: li $t2, 2
first_done:
c.lt.s $f2, $f0
li $t3, 0
bc1f 0, second_taken
li $t3, 1
b second_done # Skip the other marker unconditionally.
second_taken: li $t3, 2
second_done:
