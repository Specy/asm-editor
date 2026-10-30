# Interrupts and cycles

The arrow-key program in the screen lecture checked the keyboard on every frame. Checking a
device repeatedly like this is called **polling**. Another way to respond to an event is to let a
device ask for attention with an **interrupt request**. The processor pauses the program, runs a
handler, and then resumes it. Interrupt handling uses the exception vector table and stack frames,
and the handler returns with `rte`.

We will use a timer and the keyboard to make requests, then count the clock cycles taken by code.

## Levels and the interrupt mask

Each interrupt request, or **IRQ**, has a **level** from 1 to 7. A higher level has higher
priority. Bits 10 to 8 of `sr`, I2 to I0, hold the **interrupt mask**, a number from 0 to 7. The
processor takes a request only when its level is above the mask; a request at or below it waits
until the mask goes down. Level 7 is different: nothing holds it back, not even a mask of 7.

| bit  | 15  | 13  | 10-8  | 4-0       |
| ---- | --- | --- | ----- | --------- |
| name | T   | S   | I2-I0 | X N Z V C |

For these examples, `$2000` in `sr` selects supervisor mode and mask 0. `$2300` selects mask 3,
and `$2700` selects mask 7. The editor starts a program with `sr` set to `$2000`. You can see the
mask bits in the **System** register file.

The processor takes a request between two instructions. As for a `trap`, it switches to
supervisor mode and pushes the program counter and `sr` on the supervisor stack, six bytes. Then
it sets the mask to the request's level, so that nothing at that level or below interrupts the
handler, and jumps to the address in the level's **autovector**: vector 24 + level, at `$60` +
4 × level.

| level | vector | address |
| ----: | -----: | ------- |
|     1 |     25 | `$64`   |
|     2 |     26 | `$68`   |
|     3 |     27 | `$6C`   |
|     4 |     28 | `$70`   |
|     5 |     29 | `$74`   |
|     6 |     30 | `$78`   |
|     7 |     31 | `$7C`   |

The handler finishes with `rte`. This restores the saved `sr`, including the earlier mask, and
returns to the interrupted program. If the autovector has no handler, the program ends with an
exception.

## A timer, and `stop` to wait for it

Task 32 has several operations selected by `d1.b`. Operation 6 starts a **timer**, which makes
repeated requests at a chosen interval. `d2.b` says which timer: `$80` plus a level turns
that level's timer on, and the level alone turns it off again. `d3.l` is the interval in
milliseconds. So `$82` in `d2.b` asks for a level-2 timer.

Once the handler is installed and the timer is running, a program with nothing else to do can
wait with `stop`. `stop #$2000` loads
`$2000` into `sr`, supervisor mode with the mask at 0, and then runs nothing until a request above
the mask comes. The processor takes the request, the handler runs, and its `rte` returns to the
instruction after the `stop`.

```m68k|playground|console|no-flags|allow-open
    moveq #0, d6            ; start the tick count at zero
    move.l #tick, $68       ; level 2's autovector: the timer's handler
    move.b #6, d1           ; task 32 with d1.b = 6: a timer
    move.b #$82, d2         ; $80 + 2: turn on the level-2 timer
    move.l #500, d3         ; every 500 milliseconds
    move.b #32, d0
    trap #15
wait:
    stop #$2000             ; run nothing until a request comes
    move.l d6, d1
    move.b #3, d0
    trap #15                ; print the ticks so far
    move.b #' ', d1         ; the character code of a space
    move.b #6, d0
    trap #15                ; task 6: print the character in d1.b
    cmp.l #4, d6
    blo wait                ; four ticks: two seconds
    move.b #9, d0
    trap #15

tick:
    addq.l #1, d6           ; one more tick
    rte                     ; back to the instruction after the stop
```

```testcase
{ "expectedOutput": "1 2 3 4 " }
```

Run the example: the timer counts only while the program runs, so stepping through `stop` cannot
wait for it. The console shows a number every half second, and the program ends after two
seconds. Task 6 prints the one character whose code is in `d1.b`, and `#' '` is the code of a
space.

The handler does as little as it can: it counts, and the program does the printing once `stop`
lets it go on. A handler runs between two instructions of a program that is not expecting it, so
it should be quick, and leave every register as it found it, except the one it is there to
change, here `d6`. A longer handler saves the registers it uses with `movem` and restores them
before `rte`.

Open the example in the full editor and run it to see the waiting status beside the **Terminal**
tab. History records each IRQ and its handler steps. Taking the request costs 44 cycles. Undo can
reverse the request, leaving it waiting to be taken again.

`stop` is a privileged instruction, as writing `sr` is, so a program in user mode cannot use it.

## A key press on the screen

Task 62 asks for a request each time a key goes down or comes up on the screen panel. `d1.w`
holds the level in its high byte and the events in its low byte: bit 0 for a key going down, bit
1 for a key coming up. `move.w #$0501, d1` asks for a level-5 request on every key press, through
the autovector at `$74`.

This program counts how many times you press Space in five seconds, with a level-2 timer counting
the seconds. Run it, **click the screen panel** so that it gets the keyboard, and press Space a few
times, with other keys in between. After five seconds the program writes the count on the screen.
Holding Space can generate repeated key-down events, so release it between presses for this test.

```m68k|playground|open-screen|no-flags
SECONDS equ 5
SPACE   equ $20             ; the Space key's code

    moveq #0, d6            ; count Space key-down events
    moveq #0, d7            ; count seconds
    move.l #key_down, $74   ; level 5's autovector: a key went down
    move.l #second, $68     ; level 2's autovector: the timer
    move.w #$0501, d1       ; level 5, on every key down
    move.b #62, d0
    trap #15
    move.b #6, d1
    move.b #$82, d2         ; a level-2 timer
    move.l #1000, d3        ; every second
    move.b #32, d0
    trap #15
wait:
    stop #$2000             ; a key or the timer ends the wait
    cmp.w #SECONDS, d7
    blo wait                ; not five seconds yet: wait again
    lea result, a1
    move.l d6, d1
    move.b #17, d0          ; write the text, then the count
    trap #15
    move.b #9, d0
    trap #15

key_down:
    movem.l d0-d1, -(sp)    ; task 19 changes d0 and d1: save them
    moveq #0, d1            ; d1.l = 0: the last keys
    move.b #19, d0
    trap #15
    cmp.w #SPACE, d1        ; the last key pressed is in the low word
    bne not_space
    addq.l #1, d6           ; one more Space
not_space:
    movem.l (sp)+, d0-d1    ; and put them back
    rte
second:
    addq.w #1, d7           ; one more second
    rte

result: dc.b 'Spaces pressed: ', 0
```

`stop` lets the program continue after either kind of request. The loop checks the seconds count
and waits again until it reaches five. The counters begin at zero before either handler is enabled.

To show the result, task 17 writes a zero-terminated string followed by a decimal number on the
screen. Here `a1` holds the address of `result`, and `d1.l` holds the count copied from `d6`.

Task 19 with `d1.l = 0` returns the last key released in the high word of `d1` and the last key
pressed in the low word. The keyboard records each event before raising its request. If several
events arrive before the handler runs, requests at the same level merge and the handler reads the
most recent key. The count can therefore be lower than the number of presses.

The handler uses `d0` and `d1` for this request. It could interrupt the main program between
`move.l d6, d1` and the printing `trap #15`, when those registers already hold the print arguments.
Saving them with `movem` and restoring them before `rte` preserves those arguments.

## Interrupts and polling

Polling lets the program choose when to check a device. Interrupts let it respond to an event
without checking repeatedly, while it does other work or waits. Which is useful depends on the
program: an interrupt handler also adds work and can run between instructions.

Shared values need care. Suppose the program copies `d6` to print the count, then clears `d6` for
the next count. If a key interrupt increments `d6` between those instructions, the clear loses that
key. A program can protect a short sequence by raising the interrupt mask, then restoring its
previous value. For example, mask 7 holds back levels 1 through 6. Changing `sr` is privileged,
so this must be done in supervisor mode. Restore the saved `sr` rather than assuming it was
`$2000`; once the mask falls, a waiting request can be taken. Level 7 remains special.

## Counting cycles

Interrupt handling takes processor time too. To examine that cost and the cost of ordinary code,
we can count cycles. A 68000 works to the beat of a clock, and each beat is a **clock cycle**. Every instruction takes
a whole number of them: 4 for `moveq`, 8 for `add.l d0, d1`, 10 for a `dbra` that loops back,
more than 100 for a division. At 8 MHz, the clock of an Atari ST, a 68000 has eight million cycles
a second.

The editor counts them as a 68000 takes them. The **Cycles** line over the registers reads, for example,
`Cycles 1,016 (+4)`: the count so far, and what the last step took. In the full editor each
History row shows its own, and the **Log** tab gives the total when the program ends. Taking an
IRQ costs 44 cycles and a `trap #3` 34, but a `trap #15` task costs nothing, so tasks 30 and 31,
which the trap #15 lecture showed, can clear and read the counter without changing what they
measure: task 30 sets it back to 0, and task 31 reads it into `d1.l`.

```m68k|playground|console|no-flags|cycles|allow-open
    moveq #30, d0
    trap #15                ; the counter starts again at 0
    move.w #99, d2          ; 8 cycles
loop:
    dbra d2, loop           ; 10 cycles a round that goes back, 14 for the last
    moveq #31, d0           ; 4 cycles
    trap #15                ; read the counter into d1
    move.b #3, d0
    trap #15                ; print it
    move.b #9, d0
    trap #15
```

```testcase
{ "expectedOutput": "1016" }
```

It prints `1016`: 8 for the `move.w`, 99 × 10 for the rounds that go back, 14 for the last one,
and 4 for the `moveq #31, d0`, which runs before the read and so is counted in it. At 8 MHz those 1,016 cycles take about an eighth of a millisecond.

Build it and Step. The Cycles line grows by each instruction's cost as it runs; the
first `trap #15` sets it back to 0, and the others add nothing. Then change `#99` to `#999` and
run it again: ten times the rounds, and the program prints `10016`.

Cycles show what an instruction costs, and two ways of doing the same thing can cost very
different amounts. Multiplying `d0` by 8 with `mulu.w #8, d0` takes 44 cycles. Shifting it left by
three places with `lsl.l #3, d0` takes 14, and gives the same answer while `d0` holds a number
below 65,536, as `mulu.w` reads only the low word of `d0`.

## Your turn

### 1. A timer at level 3

Start `d6` at zero, install `tick` in level 3's autovector, and set a level-3 timer that fires every 100
milliseconds. The loop already waits until `tick` has run ten times, so `d6` must end at 10.

```m68k|playground|exercise
* initialize d6, install tick for level 3, and set a level-3 timer of 100 ms here

wait:
    stop #$2000
    cmp.l #10, d6
    bne wait
    bra done

tick:
    addq.l #1, d6
    rte

done:
```

```testcase
{ "expectedRegisters": { "d6": 10 } }
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    moveq #0, d6
    move.l #tick, $6C       ; level 3's autovector: $60 + 4 × 3
    move.b #6, d1
    move.b #$83, d2         ; $80 + 3
    move.l #100, d3
    move.b #32, d0
    trap #15

wait:
    stop #$2000
    cmp.l #10, d6
    bne wait
    bra done

tick:
    addq.l #1, d6
    rte

done:
```

</details>

### 2. Hold a level back

Two timers run here. Every 100 milliseconds the level-2 timer runs `fast`, which counts in `d6`,
and every 300 milliseconds the level-4 timer runs `slow`, which counts in `d7`. Change the `stop`
so that only the level-4 timer gets through, and the level-2 one waits the whole time: `d6` must
end at 0 and `d7` at 5.

```m68k|playground|exercise
    moveq #0, d6            ; start both counts at zero
    moveq #0, d7
    move.l #fast, $68       ; level 2
    move.l #slow, $70       ; level 4
    move.b #6, d1
    move.b #$82, d2
    move.l #100, d3
    move.b #32, d0
    trap #15                ; a level-2 timer, every 100 ms
    move.b #$84, d2
    move.l #300, d3
    trap #15                ; d0 and d1 still ask for a timer: level 4, every 300 ms

wait:
    stop #$2000             ; change the interrupt mask here
    cmp.l #5, d7
    bne wait
    bra done

fast:
    addq.l #1, d6
    rte
slow:
    addq.l #1, d7
    rte

done:
```

```testcase
{ "expectedRegisters": { "d6": 0, "d7": 5 } }
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    moveq #0, d6            ; start both counts at zero
    moveq #0, d7
    move.l #fast, $68
    move.l #slow, $70
    move.b #6, d1
    move.b #$82, d2
    move.l #100, d3
    move.b #32, d0
    trap #15
    move.b #$84, d2
    move.l #300, d3
    trap #15

wait:
    stop #$2300             ; mask 3: levels 1 to 3 wait, 4 gets through ($2200 works too)
    cmp.l #5, d7
    bne wait
    bra done

fast:
    addq.l #1, d6
    rte
slow:
    addq.l #1, d7
    rte

done:
```

</details>
