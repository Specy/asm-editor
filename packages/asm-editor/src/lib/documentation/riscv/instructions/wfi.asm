# This emulator has no interrupt source in the example, so wfi would wait indefinitely. Uncomment it to observe the wait (t0=9, t1=0), then press Stop to reset.
.text
li t0, 9
li t1, 0
# wfi
li t1, 1
