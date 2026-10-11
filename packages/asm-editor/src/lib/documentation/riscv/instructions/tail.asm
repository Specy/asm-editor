# tail transfers to done without saving a new return address. ra starts at 123 and t2 copies it after the jump.
.text
li ra, 123
tail done
li t2, 100
done:
mv t2, ra
# t2=123 shows that tail left ra unchanged.
