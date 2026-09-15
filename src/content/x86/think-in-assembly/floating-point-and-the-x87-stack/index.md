Every number so far has been a whole one. A register holding `0x05` is five, and there is no way at
all to write two and a half into it. Fractions need a different arrangement of the same sixty four
bits, and a different set of instructions to work on that arrangement, and x86 has two entirely
separate units that do it. Here is how the bits are arranged, and the older of the two units.

## Why there are two

When the 8086 shipped in 1978 it could add integers and nothing else. Fractional arithmetic was done
in software, a few hundred instructions per multiplication, which for the people who needed it, mostly
engineering and graphics, was hopelessly slow.

Intel's answer was a second chip, the **8087**, sitting beside the processor on the same board and
watching the same stream of instructions go past. The ones beginning with `f` it recognised and
carried out itself while the main chip waited; everything else it ignored. It had eight registers of
its own that the 8086 could not see, and it worked to a precision the main chip had no way to
represent. That arrangement, a second unit with its own registers reached through instructions the
main processor hands over, is what the word **coprocessor** means.

The 80486 of 1989 put it on the same piece of silicon and it stopped being a separate chip. The name
stuck. The `f` instructions and their stack of eight registers are still there, still called **x87**,
and still behave exactly as they did.

Then in 1999 the Pentium III added a **second** floating point unit with a completely different
design, called SSE, and did not remove the first. Both are still in every 64 bit processor. SSE is
what compilers emit and what the next lecture is about; x87 is what you reach for when SSE has no
instruction for what you want, which turns out to be more often than you would expect.

## How a number is stored

A floating point number is scientific notation done in binary. Instead of writing 3.75, you write
`1.111` times two to the power of one, and store three things: a **sign**, an **exponent** saying
how far the point moved, and a **mantissa**, the digits themselves.

| type   | bytes | written | sign | exponent | mantissa | good for          |
| ------ | ----- | ------- | ---- | -------- | -------- | ----------------- |
| single | 4     | `dd`    | 1    | 8        | 23       | 7 decimal digits  |
| double | 8     | `dq`    | 1    | 11       | 52       | 16 decimal digits |

NASM writes either from a literal with a dot in it, so `dq 1.5` is eight bytes and `dd 1.5` is four.
The layout is the one defined by the IEEE 754 standard, which is why a file of numbers written by one
machine can be read by another.

Take 3.75 and do it by hand, because the constants later in this lecture make no sense until you have
done it once.

**Write it in binary.** 3 is `11`. The fraction 0.75 is one half plus one quarter, so `.11`. Put them
together: `11.11`.

**Normalise it.** Move the point left until exactly one digit is in front of it, counting the moves:
`11.11` becomes `1.111` with one move, so the exponent is 1.

```
   11.11  =  1.111 x 2^1
```

**Drop the leading 1.** A normalised binary number always starts with a 1, because that is what
normalising means. Storing a bit that is always the same would be a waste, so it is not stored. The
mantissa field holds only what comes after the point, `111`, padded with zeroes to fill 52 bits.

**Bias the exponent.** The exponent needs to be able to go negative, for numbers smaller than one.
Rather than give it a sign bit of its own, the standard adds a fixed **bias** of 1023 to it first, so
every stored exponent is a plain positive number. 1 + 1023 = 1024, which is `100 0000 0000` in
eleven bits.

**Lay the three fields out**, sign first, then exponent, then mantissa:

```
 0   100 0000 0000   1110000000000000000000000000000000000000000000000000
 ^        ^                                  ^
 sign   exponent                          mantissa
 1 bit   11 bits                           52 bits
```

Now cut that same run of 64 bits into groups of four and read each group as a hex digit:

```
 0100 0000 0000 1110 0000 0000 ... 0000
   4    0    0    E    0    0       0
```

`400E000000000000`. That number appears in the panel further down this page, and it is not magic: it
is 3.75 written the only way a double can be written.

Going the other way is the same steps backwards. Given `3FF0000000000000`, the exponent field is
`0x3FF`, which is 1023, so the real exponent is 1023 - 1023 = 0. The mantissa field is all zeroes, so
with the leading 1 put back the number is `1.0`, times two to the power of zero. It is 1.0.

### Two things follow from this

**Most decimal fractions cannot be stored at all.** Try 0.1 the way you did 3.75. Doubling a fraction
repeatedly and writing down whether it passed 1 gives you its binary digits:

```
 0.1 x 2 = 0.2   ->  0
 0.2 x 2 = 0.4   ->  0
 0.4 x 2 = 0.8   ->  0
 0.8 x 2 = 1.6   ->  1     (keep 0.6)
 0.6 x 2 = 1.2   ->  1     (keep 0.2)
 0.2 x 2 = 0.4   ->  0     and we have been here before
```

`0.0001100110011...`, repeating for ever, exactly the way 1/3 repeats in decimal. Fifty two bits is
where the processor has to stop, so what a double actually holds is the nearest number it can write to
0.1, and that is why 0.1 + 0.2 does not come to 0.3. Nothing is broken. You asked for a base ten
fraction in a base two format.

**Some bit patterns are not numbers.** An exponent field of all ones is reserved. With a zero mantissa
it means **infinity**, which is what one divided by zero produces here instead of a fault. With a
non-zero mantissa it is a **NaN**, not a number, which is what zero divided by zero produces. A NaN
compared with anything answers false, including when it is compared with itself.

## x87: a stack instead of a register file

The x87 registers are not numbered. They are a **stack of eight**, and every instruction works
relative to the top of it. `st0` is whatever is on top right now, `st1` is the one underneath, and
pushing a value renames all of them: what was `st0` becomes `st1`.

| instruction                                | does                                                |
| ------------------------------------------ | --------------------------------------------------- |
| `fld qword [x]`                            | push the double at `x`                              |
| `fild dword [n]`                           | push an integer, converted                          |
| `fld1`, `fldz`, `fldpi`                    | push 1.0, 0.0 or pi                                 |
| `faddp`                                    | add the top two, pop one, leaving the answer on top |
| `fmulp`, `fsubp`, `fdivp`                  | the same for the other three operations             |
| `fsqrt`, `fsin`, `fcos`, `fpatan`, `f2xm1` | replace `st0` with a function of it                 |
| `fstp qword [x]`                           | store `st0` and pop                                 |
| `fistp dword [n]`                          | store as an integer, **rounded**, and pop           |
| `fxch`                                     | swap `st0` and `st1`                                |

```x86|playground|x87|no-flags
default rel
global _start

section .data
a:      dq 1.5
b:      dq 2.25
n:      dd 7

section .bss
out:    resq 1
iout:   resd 1

section .text
_start:
    fld qword [a]           ; st0 = 1.5
    fld qword [b]           ; st0 = 2.25, st1 = 1.5
    faddp                   ; st0 = 3.75, and the stack is one deep again
    fstp qword [out]        ; store it and empty the stack
    mov r8, [out]

    fldpi                   ; pi
    fsqrt                   ; the square root of pi
    fstp qword [out]
    mov r9, [out]

    fild dword [n]          ; 7 as a float
    fsqrt                   ; 2.6457...
    fistp dword [iout]      ; and back to an integer
    mov r10d, [iout]

    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through it with the panel on its **x87** tab and watch the stack work. `fld qword [a]` puts 1.5
in `st0`. The second `fld` puts 2.25 in `st0` and 1.5 slides down to `st1`, without either instruction
naming a register. `faddp` adds the two and pops one, so where there were two values there is now one.
A slot that has been popped shows blank: the bits are still sitting there, and a separate tag word
says the slot is empty, which is what the panel reads.

`r8` holds `400E000000000000`, which is the number you took apart at the top of this page.

`r10` is **3**, not 2, and that is worth a moment. The square root of 7 is 2.6457, and `fistp` rounds
to the nearest whole number rather than throwing the fraction away. If you wanted 2 you wanted
truncation, and x87 will only truncate if you change the rounding mode first, which is what `fctrl`
is for.

`fsin`, `fcos`, `fpatan` and `f2xm1` are why x87 is still worth knowing. SSE has no instruction for
any of them, so a program that wants a sine either calls a library function or comes back here.

This emulator keeps the x87 stack as ordinary 64 bit doubles. Real hardware works at **80 bit**
extended precision inside the unit and only rounds when a value is stored, so a long chain of x87
arithmetic here can differ from a physical processor in the last few bits.

`fctrl`, `fstat` and `ftag` are the unit's three control and status registers, holding the rounding
mode, the exception flags, and the record of which of the eight slots are in use. All three are on the
x87 tab.

## Your turn

Leave the sine of the double at `angle` in the qword at `out` and read it back into `r8`. `angle`
holds the number of radians in a right angle, so the sine of it is 1.0. That is the number you decoded
above, `3FF0000000000000`, which is what `r8` should read.

```x86|playground|x87|exercise
default rel
global _start

section .data
angle:  dq 1.5707963267948966     ; pi / 2

section .bss
out:    resq 1

section .text
_start:
    ; your code here

    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": "0x3FF0000000000000" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|x87|solution
default rel
global _start

section .data
angle:  dq 1.5707963267948966     ; pi / 2

section .bss
out:    resq 1

section .text
_start:
    fld qword [angle]       ; push the angle
    fsin                    ; replace it with its sine
    fstp qword [out]        ; store and pop

    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
