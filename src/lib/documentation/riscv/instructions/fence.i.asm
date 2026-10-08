# fence.i synchronizes instruction fetch after code changes; this single-threaded example has no self-modifying code, so t0 stays 9.
.text
li t0, 9
fence.i
