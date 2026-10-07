# jal calls a local routine and saves the return address in $ra. Inspect $t2: 1 after return.
jal routine
li $t2, 1
b done # Skip the routine after returning.
routine: li $t2, 2
jr $ra # Return to the instruction after the call.
done:
