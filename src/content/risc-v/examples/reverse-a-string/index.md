The string at `0x10010000` is turned back to front where it lies, with no second buffer to copy it
into. Two registers start at the two ends and walk towards each other, swapping the bytes they point
at until they meet.

Length of a string walked to the terminator to measure something. This one walks to the terminator
to find the far end and then does its work on the way back, so there are two pointers moving at once
and neither of them is a counter.

**You need to know:** the "Length of a string" Example and the "Loads, stores and immediates"
lecture. What is new here is comparing two addresses, `bgeu` is what tells the loop that the two
pointers have met.

```riscv|playground|memory|allow-open
.data
text: .asciz "Assembly"

.text
main:
    la t0, text         # left = text
    mv t1, t0           # right = text
find_end:
    lb t2, 0(t1)
    beqz t2, at_end     # walk to the terminator
    addi t1, t1, 1
    j find_end
at_end:
    addi t1, t1, -1     # back onto the last character
swap_loop:
    bgeu t0, t1, done   # while(left < right)
    lb t2, 0(t0)        # t = *left
    lb t3, 0(t1)        # u = *right
    sb t3, 0(t0)        # *left = u
    sb t2, 0(t1)        # *right = t
    addi t0, t0, 1      # left++
    addi t1, t1, -1     # right--
    j swap_loop
done:
```

`addi t1, t1, -1` after the scan is the awkward line, and it takes off exactly one byte: the scan
stops **on** the terminator, so one step back is the last character. The M68K version subtracts two
there, because its `tst.b (a1)+` steps past every byte it looks at including the zero.

The swap needs both bytes in registers before either is written, which is why `t2` and `t3` are both
loaded first. There is no instruction that exchanges two bytes of memory, and there is nothing that
loads and steps in one go, so a swap here is two loads, two stores and two `addi` instructions.

`bgeu` is the **unsigned** branch, which is the right family for addresses: they are 32 bit numbers
that are never negative, and an address with its top bit set would look negative to `bge`. The data
section starts at `0x10010000` and the stack at `0x7FFFEFFC`, so nothing on this page has that top
bit set; `0xFFFF0000`, where the keyboard registers live, does. The loop stops as soon as `t0` is no
longer below `t1`, so a string with an odd number of characters leaves its middle one alone, which
is what you want.

Run it with the memory panel on `10010000` and the eight bytes read `79 6C 62 6D 65 73 73 41`, which
its text button draws as `ylbmessA`.

Try changing the string to `.asciz "Level"`: five characters, the `v` in the middle stays where it
is, and the memory panel reads `leveL`.
