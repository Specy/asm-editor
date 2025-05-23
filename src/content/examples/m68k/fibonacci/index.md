```m68k|playground|allow-open|large|tall|memory|console
* --- Main Program ---
ORG     $1000       ; Starting address for code

START:

    ; --- Call Fibonacci ---
    ; Calculate fib(10) for example
    MOVE.W  #10, d0       ; Load the value 'n' into d0
    BSR     FIB           ; Branch to Subroutine FIB

    ; --- Store Result ---
    ; The result fib(n) is now in d0
    MOVE.L  d0, RESULT    ; Store the result in memory location RESULT

    ; --- Halt/Stop ---
    bra END
    ; Alternatively, use an infinite loop or a system trap
    ; BRA.S   *             ; Infinite loop
    ; TRAP    #15           ; Generic halt trap if supported

*----------------------------------------------------------------------
* Recursive Fibonacci Function: fib(n)
* Input:   d0.W = n
* Output:  d0.L = fib(n)
* Destroys: d0, d1
* Preserves: d2-d7, a0-a6 (by saving/restoring d2 used internally)
*----------------------------------------------------------------------
FIB:
    ; --- Function Prologue ---
    LINK    a6, #-8       ; Set up stack frame pointer (a6) and reserve 8 bytes
                          ; for saving registers (d1, d2). Note: LINK saves old A6.
    MOVEM.L d1-d2, -(sp)  ; Save registers d1 and d2 onto the stack (callee-save)

    ; --- Base Cases ---
    CMP.W   #0, d0        ; Check if n == 0
    BEQ     FIB_BASE_0    ; If yes, branch to base case 0

    CMP.W   #1, d0        ; Check if n == 1
    BEQ     FIB_BASE_1    ; If yes, branch to base case 1

    ; --- Recursive Step: fib(n) = fib(n-1) + fib(n-2) ---

    ; 1. Calculate fib(n-1)
    MOVE.L  d0, d2        ; Save n in d2 temporarily
    SUBQ.W  #1, d0        ; d0 = n - 1
    BSR     FIB           ; Recursive call: d0 = fib(n-1)

    ; d0 now holds fib(n-1). Need to save it before calculating fib(n-2).
    MOVE.L  d0, d1        ; Save fib(n-1) in d1

    ; 2. Calculate fib(n-2)
    MOVE.L  d2, d0        ; Restore original n from d2 into d0
    SUBQ.W  #2, d0        ; d0 = n - 2
    BSR     FIB           ; Recursive call: d0 = fib(n-2)

    ; d0 now holds fib(n-2), and d1 holds fib(n-1)

    ; 3. Add results
    ADD.L   d1, d0        ; d0 = fib(n-2) + fib(n-1)

    ; Result is now in d0, skip base case code
    BRA   FIB_DONE

FIB_BASE_0:
    MOVEQ   #0, d0        ; fib(0) = 0
    BRA     FIB_DONE      ; Go to cleanup

FIB_BASE_1:
    MOVEQ   #1, d0        ; fib(1) = 1
    ; Fall through to FIB_DONE

FIB_DONE:
    ; --- Function Epilogue ---
    MOVEM.L (sp)+, d1-d2  ; Restore saved registers d1 and d2 from stack
    UNLK    a6            ; Restore stack pointer and old a6 (frame pointer)
    RTS                   ; Return from Subroutine (result is in d0)

*----------------------------------------------------------------------
* Data Section
*----------------------------------------------------------------------
ORG     $2000       ; Starting address for data

RESULT: DS.L    1           ; Reserve 1 Long Word (32 bits) for the result

END:
```
