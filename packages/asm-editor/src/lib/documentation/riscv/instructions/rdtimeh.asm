# Read the upper 32 bits of the time counter twice. Inspect t2=0: the second unsigned reading did not decrease.
.text
rdtimeh t0
rdtimeh t1
bltu t1, t0, backwards # Test whether the second reading is lower, treating both as unsigned.
li t2, 0
j done # Keep t2=0 by skipping the alternate result block.
backwards:
li t2, 1
done:
