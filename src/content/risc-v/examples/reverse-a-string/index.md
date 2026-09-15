The string at `0x10010000` is turned back to front where it lies, with no second copy of it anywhere.
Two registers start at the two ends and walk towards each other, swapping the bytes they point at
until they meet in the middle.

```riscv|playground|memory|allow-open
.data
text: .asciz "Assembly"

.text
main:
    la t0, text         # the left pointer
    mv t1, t0           # the right one, still at the start
find_end:
    lb t2, 0(t1)
    beqz t2, at_end     # walk it to the terminator
    addi t1, t1, 1
    j find_end
at_end:
    addi t1, t1, -1     # back onto the last character
swap_loop:
    bgeu t0, t1, done   # stop once they have met
    lb t2, 0(t0)
    lb t3, 0(t1)
    sb t3, 0(t0)        # each byte into the other's place
    sb t2, 0(t1)
    addi t0, t0, 1
    addi t1, t1, -1
    j swap_loop
done:
```

The program only knows where the string starts, so the right pointer has to be found first. That
scan stops on the terminator, which is one byte past the last character, and `addi t1, t1, -1` is
what backs it onto a real letter.

Here is the string after the first two passes and after the last one, with the addresses held still
and only the contents moving:

```
      t0                                   t1
      v                                    v
      A   s   s   e   m   b   l   y    0        start
   10010000                        10010007

          t0                   t1
          v                    v
      y   s   s   e   m   b   l   A    0        after one swap

                  t0  t1
                  v   v
      y   l   s   e   m   b   s   A    0        after two

                    t1  t0
                    v   v
      y   l   b   m   e   s   s   A    0        they have crossed
```

Once the pointers cross, `bgeu t0, t1, done` is true and the loop is over. A string with an odd
number of characters leaves its middle one untouched, which is correct: a character swapped with
itself is the same character.

The swap itself needs both bytes read before either is written, which is why there are two loads
before the two stores. Write `sb` into the left position first and you have destroyed the byte you
were about to copy out of it.

`bgeu` is the **unsigned** comparison, which is the family for addresses. An address is a 32 bit
number that is never negative, but the top bit of a big address is set, and the signed comparison
would read that bit as a minus sign. Nothing on this page is anywhere near that high, `0x10010000`
and the stack are both safe, but the keyboard registers at `0xFFFF0000` are not, and the habit is
worth forming now.

Run it with the memory panel on `10010000`. The eight bytes read `79 6C 62 6D 65 73 73 41`, and the
panel's text button draws them as `ylbmessA`.
