# Arrays, strings and (a0)+

An **array** is a sequence of equal-size elements stored consecutively in memory. To work with one,
a program needs three facts:

- the **base address**, where the first element begins;
- the **element size**, in bytes;
- the **element count**, which says how many elements belong to the array.

Here are five long-sized elements beginning at `$2000`:

| element index | address | value |
| ------------: | ------- | ----: |
|             0 | `$2000` |    10 |
|             1 | `$2004` |    20 |
|             2 | `$2008` |    30 |
|             3 | `$200C` |    40 |
|             4 | `$2010` |    50 |

Each long occupies four bytes, so each address is four greater than the previous one. Memory does
not store the count beside the elements: the program must keep or otherwise know that count.

## Visit every element with `(a0)+`

Postincrement addressing accesses memory at the address in an address register, then advances that
register by the size of the memory access. For `a0` through `a6`, a byte access advances by 1, a
word access by 2, and a long access by 4. The rule is about the value accessed, as selected by
`.b`, `.w`, or `.l`—not the encoded length of the instruction.

This loop adds the five longs from the table:

```m68k|playground|memory|no-flags
count equ 5

    move.l #numbers, a0 ; address of the first long
    move.l #0, d0       ; sum = 0
    move.l #count, d2   ; number of elements to visit

    tst.l d2
    beq sum_done        ; a count of zero must skip the body
    move.l d2, d1
    sub.l #1, d1        ; prepare the dbra counter
sum_loop:
    add.l (a0)+, d0     ; read one long, then advance a0 by 4
    dbra d1, sum_loop
sum_done:

    org $2000
numbers: dc.l 10, 20, 30, 40, 50
```

`d0` ends at 150. The body runs five times, and `a0` moves through `$2000`, `$2004`, `$2008`,
`$200C`, and `$2010`. The last access then advances it to `$2014`, the address immediately after
the array. This is called a **one-past-end pointer**. It is useful as a stopping position, but it
does not point to an element of this array and must not be dereferenced as though it did.

The test before the loop matters when an element count may be zero. Without it, the body would
still run once before `dbra` could decide whether to repeat. For a fixed array whose count is known
to be nonzero, `move.w #count-1,d1` is enough to prepare the counter directly.

The access size and the declaration must agree. For a word array, use `dc.w` and a word-sized
memory operation such as `add.w (a0)+,d0`; `a0` then advances by 2. For a byte array, a `.b`
memory access advances it by 1.

## Reach one element by index

Postincrement is a natural fit when a loop visits every element in order. To reach a chosen element
without moving the base address, first convert its element index to a byte offset:

```text
byte offset       = element index * element size
effective address = base address + byte offset
```

Keep those two quantities distinct. In this example, `d1` is the element index and `d2` is the
scaled byte offset:

```m68k|playground|memory|no-flags
    move.l #numbers, a0
    move.l #2, d1           ; element_index = 2
    move.l d1, d2           ; begin byte_offset with the index
    lsl.l #2, d2            ; byte_offset = element_index * 4
    move.l 0(a0,d2.w), d0   ; read at base + byte_offset

    org $2000
numbers: dc.l 10, 20, 30, 40, 50
```

The index 2 becomes the byte offset 8, so the effective address is `$2000 + 8 = $2008` and `d0`
receives 30. Neither `a0` nor `d1` changes.

On the base 68000, this indexed form uses the low word of `d2` as a signed byte offset. Therefore,
the offset used by `0(a0,d2.w)` must fit from -32768 through 32767. The example uses the positive
offset 8. Here `d2` holds the scaled byte offset used in the address. Using the element index from
`d1` instead would add 2 bytes rather than reach element 2.

## Strings are zero-terminated byte arrays

In this course, a **string** is an array of byte-sized character codes followed by a zero byte. The
zero is the **terminator**. Here the ASCII codes `$48`, `$69`, and `$21` represent `H`, `i`, and
`!`; the final `0` is written explicitly:

```m68k
message: dc.b $48, $69, $21, 0
```

| address       | byte  | meaning        |
| ------------- | ----- | -------------- |
| `message`     | `$48` | `H`            |
| `message + 1` | `$69` | `i`            |
| `message + 2` | `$21` | `!`            |
| `message + 3` | `$00` | the terminator |

A sentinel loop does not receive a separate count. It keeps reading until it finds a special value,
which is zero here. That traversal is safe only when a terminator is guaranteed to occur within
readable memory. Without that guarantee, the loop can continue beyond the intended bytes.

The length is the number of payload bytes before the terminator:

```m68k|playground|memory|no-flags
    move.l #message, a0
    move.l #0, d0       ; length = 0
length_loop:
    tst.b (a0)+         ; test one byte, then advance by 1
    beq length_done
    add.l #1, d0
    bra length_loop
length_done:

    org $2000
message: dc.b $48, $69, $21, 0
```

`d0` ends at 3. The terminator is read so that it can stop the loop, but it is not included in the
length. After that read, `a0` is `$2004`, one byte past the terminator.

## Copy the terminator too

A string copy must include the terminator. The destination must have capacity for every payload
byte **plus one more byte** for that terminator. The source below has three payload bytes and a
terminator, and `copy` reserves exactly four bytes:

```m68k|playground|memory|no-flags
    move.l #source, a0
    move.l #copy, a1
copy_loop:
    move.b (a0)+, (a1)+ ; copy one byte; both pointers advance by 1
    bne copy_loop       ; move set Z when the copied byte was zero

    org $2000
source: dc.b $43, $41, $54, 0
copy:   ds.b 4
```

The final pass copies the zero byte and sets `Z`, so `bne` falls through only after the destination
has its own terminator. This loop relies on two guarantees: `source` has a zero terminator in
readable memory, and `copy` has room for all four bytes. The loop itself cannot discover whether
either region is large enough.

## Keep words and longs aligned

Word and long accesses must begin at even addresses. An array of words or longs stays aligned when
its base address is even because every element has an even size. Byte data placed before it can
make the next address odd, however. Add an explicit padding byte when needed:

```m68k
    org $2000
bytes:   dc.b $41, $42, $43
padding: dc.b 0
values:  dc.w 10, 20
```

`bytes` occupies `$2000` through `$2002`; the padding occupies `$2003`, so `values` begins at the
even address `$2004`.

## Check your understanding

### 1. Sum a long array

`values` contains three long-sized elements. Use `(a0)+` and `dbra` to add all three into `d0`.
Initialize only the low word of `d1` with `count-1`, so its starting upper word remains visible.

After the loop, `a0` must be the one-past-end address `$200C`, `d0` must contain 60, and `d1` must
contain `$A5A5FFFF`. The values are longs even though their numbers are small; using `.b` or `.w`
would read different bytes and advance the pointer by the wrong distance.

```m68k|playground|memory|exercise
count equ 3

; your code here

    org $2000
values: dc.l 10, 20, 30
```

```testcase
{
    "startingRegisters": {
        "a0": "0xDEADBEEF",
        "d0": "0xDEADBEEF",
        "d1": "0xA5A5BEEF"
    },
    "expectedRegisters": {
        "a0": "0x200C",
        "d0": 60,
        "d1": "0xA5A5FFFF"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
count equ 3

    move.l #values, a0
    move.l #0, d0
    move.w #count-1, d1
sum_loop:
    add.l (a0)+, d0
    dbra d1, sum_loop

    org $2000
values: dc.l 10, 20, 30
```

</details>

### 2. Copy a terminated string into exact-size storage

`source` contains the two payload bytes `$4F` and `$4B`, followed by a guaranteed zero terminator.
Copy the complete string to `dest` with postincrement addressing. `dest` has capacity for exactly
three bytes: two payload bytes plus the terminator. Do not change the guard byte after it.

```m68k|playground|memory|exercise
; your code here

    org $2000
source: dc.b $4F, $4B, 0
dest:   ds.b 3
guard:  dc.b $A5
```

```testcase
{
    "expectedRegisters": {
        "a0": "0x2003",
        "a1": "0x2006"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x2003",
            "bytes": 1,
            "expected": [79, 75, 0, 165]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    move.l #source, a0
    move.l #dest, a1
copy_loop:
    move.b (a0)+, (a1)+
    bne copy_loop

    org $2000
source: dc.b $4F, $4B, 0
dest:   ds.b 3
guard:  dc.b $A5
```

</details>
