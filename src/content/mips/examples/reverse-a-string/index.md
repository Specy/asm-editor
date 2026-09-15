The string at `0x10010000` is turned back to front where it lies, with no second buffer to copy it
into. Two registers start at the two ends and walk towards each other, swapping the bytes they point
at until they meet.

```mips|playground|memory|allow-open
.data
text: .asciiz "Assembly"

.text
main:
    la $t0, text        # the pointer that walks forwards
    move $t1, $t0       # and the one that will walk back
find_end:
    lb $t2, 0($t1)
    beqz $t2, at_end    # walk to the terminator
    addi $t1, $t1, 1
    j find_end
at_end:
    addi $t1, $t1, -1   # back onto the last character
swap_loop:
    bgeu $t0, $t1, done # while(left < right)
    lb $t2, 0($t0)      # t = *left
    lb $t3, 0($t1)      # u = *right
    sb $t3, 0($t0)      # *left = u
    sb $t2, 0($t1)      # and the left byte into the right
    addi $t0, $t0, 1    # the two pointers move towards
    addi $t1, $t1, -1   # each other
    j swap_loop
done:
```

`addi $t1, $t1, -1` after the scan is the line people get wrong, and the fix is to be precise about
where the scan stopped. It stopped **on** the terminator, not past it, so `$t1` is pointing at the
zero byte and the last character is one address below that. Hence minus one, exactly once.

The swap loads both bytes before it writes either of them, and it has to. Write `$t2` into the right
hand position first and the byte that was there is gone before you have read it. There is no
instruction that exchanges two bytes of memory in one go, so a swap is two loads, two stores and the
two `addi` instructions that move the pointers.

`bgeu` is the **unsigned** branch, which is the right family for addresses: they are 32 bit numbers
that are never negative, and an address with its top bit set would look negative to `bge`. The loop
stops as soon as `$t0` is no longer below `$t1`, so a string with an odd number of characters leaves
its middle one alone, which is what you want.

Run it with the memory panel on `10010000` and the eight bytes read `79 6C 62 6D 65 73 73 41`, which
its text button draws as `ylbmessA`.

An odd length string is the case worth checking. Change the string to `.asciiz "Level"` and the
panel reads `leveL`: five characters, and the `v` in the middle never moves, because the loop stops
as soon as the two pointers meet and a middle character has nothing to swap with.
