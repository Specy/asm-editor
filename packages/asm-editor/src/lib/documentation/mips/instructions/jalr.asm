# jalr calls a local routine and writes the return address to $ra. Inspect $t2: 1 after return.
la $t0, routine
jalr $t0
li $t2, 1
b done # Skip the routine after returning.
routine: li $t2, 2
jr $ra # Return to the instruction after the call.
done:
