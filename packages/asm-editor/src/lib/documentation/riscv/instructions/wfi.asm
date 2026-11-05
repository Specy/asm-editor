# wfi waits until an interrupt is asking. Here it is the timer: timecmp is set 20 ms
# ahead, and wfi waits until the time register reaches it. Interrupts are not turned
# on in ustatus, so no handler runs: the program simply carries on after wfi.
.text
li t0, 0x10            # uie bit 4: the timer may end the wait
csrs t0, uie
li s0, 0xffff0018      # time; timecmp is 8 bytes further on
lw t1, 0(s0)           # the time now, in milliseconds
addi t1, t1, 20
sw t1, 8(s0)           # timecmp = now + 20 ms
sw zero, 12(s0)
wfi                    # waits about 20 ms
lw t2, 0(s0)           # the time after the wait
sltu t3, t2, t1        # Inspect t3: 0, the time has reached timecmp
