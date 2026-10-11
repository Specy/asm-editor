# la sets ra to the local done label to simulate a function return. ret transfers there, where t2 becomes 1.
.text
li t2, 0
la ra, done
ret
addi t2, t2, 100
done:
addi t2, t2, 1
