# b transfers to done; the skipped instruction would add 100 to t2.
.text
li t2, 0
b done
addi t2, t2, 100
done:
addi t2, t2, 1
# t2=1 confirms the named transfer reached done.
