# Read the upper 32 bits of the retired-instruction counter twice. Inspect t2=0: the second unsigned reading did not decrease.
.text
rdinstreth t0
rdinstreth t1
bltu t1, t0, backwards # Test whether the second reading is lower, treating both as unsigned.
li t2, 0
j done # Keep t2=0 by skipping the alternate result block.
backwards:
li t2, 1
done:
