# EASy68K machine behaviour, read from its source (v5.16.1)

Gathered 2026-10-21 for the [M68K machine design](../design/m68k-machine.md), to settle how EASy68K's simulator and assembler behave wherever s68k is to follow them: reset state, exceptions, supervisor mode, interrupts, the hardware window, the memory map, cycle counts, instruction sizes and encodings. Everything below was read from source; nothing was built or run. This is a fact base, not a set of decisions.

## Source and citation scheme

- Downloaded from https://github.com/ProfKelly/EASy68K (master): `Sim68Kv5.16.1.zip`, `Edit68Kv5.16.1.zip`,
  `EASy68K_Helpv5.16.1.zip`. Simulator and editor are both v5.16.01 (March 2018).
- Citation prefixes, relative to the unpacked zips:
    - `SIM/` = `Sim68Kv5.16.1/`
    - `ASM/` = `Edit68Kv5.16.1/`
    - `HELP/` = `EASy68K_Helpv5.16.1/`
- The `.CPP` files are Latin-1, so plain `grep` treats them as binary and skips them silently. Use `grep -a`, or convert them with `iconv -f latin1 -t utf8`, which keeps the line numbers cited here.
- The older `fduhia/Easy68k` tree (5.12.28) was not needed; every answer comes from 5.16.1.

## How the simulator is built (context for all answers)

- **CPU state** is held in globals: `long D[8], A[9]; long PC; short SR;` (SIM/var.h:43-45).
  `A[7]` is the USP and `A[8]` is the SSP. `a_reg(7)` returns 8 when SR.S=1 (SIM/UTILS.CPP:229-237).
- **Memory** is one host array, `char *memory`, 16 MB in size (SIM/def.h:56, SIM/SIM68Ku.cpp:153).
    - Effective addresses are host pointers into that array (`EA1 = (long*)&memory[addr & ADDRMASK]`, SIM/RUN.CPP:146).
    - `put()` and `value_of()` tell a register from memory by comparing pointer ranges (SIM/UTILS.CPP:583, 615).
    - Every memory read goes through `mem_req` and every write through `mem_put` (SIM/UTILS.CPP:339-499).
- **Decode** does a linear search of `inst_arr` within the bucket for the top nibble
  (SIM/OPCODES.H:31-137, SIM/RUN.CPP:764-769).
- **Execution loop.** `runLoop` repeatedly calls `runprog`, and `runprog` calls `exec_inst` (one instruction).
  GUI messages are pumped between instructions (SIM/SIM68Ku.cpp:249-266, SIM/RUN.CPP:638-721).
- **Instruction handlers return a code** (`SUCCESS`, `BAD_INST`, `NO_PRIVILEGE`, `TRAP_TRAP`, and so on; SIM/def.h:86-102).
  `exec_inst` maps each code to an exception or to a halt (SIM/RUN.CPP:862-1000).
  Address and bus errors are different: they are raised _inside_ `mem_req`/`mem_put` at the moment of the faulting access.
- **The GUI holds the registers between runs.** Run, Step and Trace first call `loadRegs()`, which parses every register,
  including SR bit by bit, back out of the GUI text fields (SIM/SIM68Ku.cpp:441-447, 501-521, 990-1019).

---

# Simulator

## 1. Reset and initial state

| Item                                   | Value                                                                                                                                                                                 | Source                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Memory size                            | 16 MB (`MEMSIZE = 0x01000000`), 24-bit bus. The top byte of every address is ignored (`ADDRMASK = 0x00ffffff`).                                                                       | SIM/def.h:56-57; SIM/UTILS.CPP:366-369, 442-445; HELP/SIMHELP/Hardware.htm ("Memory Map")                                      |
| Memory fill                            | **$FF everywhere.** Filled at application start and again on every Open/Reload of a program.                                                                                          | SIM/SIM68Ku.cpp:153-155, 277-278; Reload = `OpenFile` (1366-1368)                                                              |
| Toggle-switch byte                     | Set to $00 after the fill                                                                                                                                                             | SIM/SIM68Ku.cpp:280-282                                                                                                        |
| Push-button byte                       | Stays $FF from the fill (buttons are active low)                                                                                                                                      | SIM/hardwareu.cpp:664-669                                                                                                      |
| SR                                     | `$2000`: supervisor, interrupt mask 0, T=0                                                                                                                                            | SIM/STARTSIM.CPP:62                                                                                                            |
| D0-D7, A0-A6                           | 0                                                                                                                                                                                     | SIM/STARTSIM.CPP:59-60                                                                                                         |
| USP (`A[7]`)                           | `$00FF0000`                                                                                                                                                                           | SIM/STARTSIM.CPP:63                                                                                                            |
| SSP (`A[8]`), and so A7 at start       | `$01000000`. The first push lands at $00FFFFFC.                                                                                                                                       | SIM/STARTSIM.CPP:64; HELP/SIMHELP/Exceptions.htm (last paragraph)                                                              |
| Cycle counter, pending IRQs, STOP flag | All 0 or false; auto-IRQ timers off; hardware enabled                                                                                                                                 | SIM/STARTSIM.CPP:61, 67, 79-84                                                                                                 |
| PC                                     | Taken from the S7/S8/S9 record, then **overwritten** by the first 8 characters of the `.L68` listing (`XXXXXXXX Starting Address`) when a listing exists. `initSim` never touches PC. | SIM/SIMOPS2.CPP:308-334; SIM/SIM68Ku.cpp:292-308                                                                               |
| Vector table $000-$3FF                 | **Not initialised.** It holds only what the program's S-records write; everything else reads $FFFFFFFF.                                                                               | Fill above; HELP/SIMHELP/SimOptions.htm: "The 68K program being simulated is responsible for setting up the exception vectors" |

Further notes on loading and resetting:

- **Where the start address comes from.** The assembler writes the END operand both as the S8 record (ASM/OBJECT.CPP:346) and on line 1 of the listing (ASM/LISTING.CPP:107, 280-281).
    - `END` without an operand gives `$1000` plus a warning (ASM/DIRECTIV.CPP:223-226).
    - An odd END address is rounded up by one (ASM/DIRECTIV.CPP:238-241).
- **The loader** writes `memory[loc++ & ADDRMASK]` and rejects any address above `MEMSIZE-1` (SIM/SIMOPS2.CPP:350-356).
    - EASy68K S0 records can carry a memory map; see Q9 (SIM/SIMOPS2.CPP:258-280).
- **Option tags in the listing.** On load, the simulator scans column 41 of the `.L68` for (SIM/SIM68Ku.cpp:310-337):
    - `*[sim68k]break`
    - `*[sim68k]bitfield`
    - `*[sim68k]simhalt_off`
- `simhalt_on` is set back to true on every open (SIM/SIM68Ku.cpp:285).
- **Rewind ("Reset Program")** sets `PC = startPC` and calls `initSim()`. It does **not** reload or erase memory (SIM/SIM68Ku.cpp:542-549).
- **Reset exception at load: none.** Vectors 0 and 1 are read only by the Hardware window's Reset button (Q5).

## 2. Exception processing

### Implemented exceptions (`exceptions` option ON)

| Exception                                      | What triggers it                                                                                                                             | Vector address | Cycles                      | PC pushed by EASy68K                                                                                | Source                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Bus error                                      | Memory-map violation (Q9). There is no bus error for "outside 16 MB": the address is masked before the check, so that branch is unreachable. | $08            | 50                          | `OLD_PC+2` (instruction address + 2)                                                                | SIM/UTILS.CPP:255-313, 453-481; SIM/RUN.CPP:1058-1076           |
| Address error                                  | Odd word or long data access, or fetch at an odd PC                                                                                          | $0C            | 50                          | `OLD_PC+2`. For reads, `mem_req` first sets `OLD_PC = PC-2`, so the pushed value is the current PC. | SIM/UTILS.CPP:352-364, 427-440                                  |
| Illegal instruction                            | No table match; bad size or EA field; `ILLEGAL` ($4AFC); BF\* opcodes when bit-field support is off                                          | $10            | 34                          | `PC-2` (`OLD_PC -= 2`)                                                                              | SIM/RUN.CPP:868-872, 1003-1004; SIM/CODE9.CPP:171-176           |
| Divide by zero                                 | DIVU or DIVS with a zero source                                                                                                              | $14            | 42                          | Next instruction                                                                                    | SIM/RUN.CPP:907-910; SIM/CODE4.CPP:193-194, 239-240             |
| CHK                                            | `Dn < 0 \|\| Dn > src`                                                                                                                       | $18            | 44                          | Next instruction                                                                                    | SIM/RUN.CPP:911-914; SIM/CODE9.CPP:143-167                      |
| TRAPV                                          | V set                                                                                                                                        | $1C            | 34                          | Next instruction                                                                                    | SIM/RUN.CPP:915-918; SIM/CODE9.CPP:1288-1298                    |
| Privilege violation                            | See Q4                                                                                                                                       | $20            | 34                          | PC at the point of detection, **not** the instruction start (Q4)                                    | SIM/RUN.CPP:873-876                                             |
| Trace                                          | SR.T as it was _before_ the instruction                                                                                                      | $24            | 34                          | Next instruction                                                                                    | SIM/RUN.CPP:847-850, 882-888                                    |
| Line A                                         | `$Axxx`                                                                                                                                      | $28            | 34                          | opcode + 2 (**not** rewound)                                                                        | SIM/OPCODES.H:118; SIM/CODE9.CPP:1300-1303; SIM/RUN.CPP:923-926 |
| Line F                                         | `$Fxxx`, except SIMHALT (Q10)                                                                                                                | $2C            | 34                          | opcode + 2                                                                                          | SIM/OPCODES.H:136; SIM/CODE9.CPP:1305-1322; SIM/RUN.CPP:927-930 |
| Interrupt, autovector levels 1-7               | Pending `irq` bits (Q7)                                                                                                                      | $64-$7C        | 34, plus 44 at request time | Next instruction                                                                                    | SIM/RUN.CPP:878-880, 1083-1117                                  |
| TRAP #0-#14, and TRAP #15 with an unknown task | `TRAP_TRAP`                                                                                                                                  | $80 + 4n       | 38                          | Next instruction                                                                                    | SIM/RUN.CPP:903-906; SIM/CODE9.CPP:1277-1282                    |

**Not implemented:**

- Reset exception at load
- Spurious interrupt (vector 24, $60)
- Uninitialised interrupt (vector 15)
- User/vectored interrupts (vectors 64-255); every interrupt is autovectored
- The 68000 HALT state proper
- Any VBR or 68010 frame format

### Frame layout: `exceptionHandler(clas, loc, r_w)` (SIM/RUN.CPP:1038-1080)

```c
if ( (clas == 1) || (clas == 2)) {
  A[8] -= 4;  put(&memory[A[8]], OLD_PC, LONG);
  A[8] -= 2;  put(&memory[A[8]], SR, WORD);
} else {                       /* class 0: address or bus error */
  inc_cyc (50);
  A[8] -= 4;  put(..., OLD_PC+2, LONG);   // "OLD_PC+2 to match MECB"
  A[8] -= 2;  put(..., SR, WORD);
  A[8] -= 2;  put(..., inst, WORD);       // instruction register
  A[8] -= 4;  put(..., loc, LONG);        // access address
  A[8] -= 2;
  if (loc == OLD_PC+2) infoWord = 0x6;    // FC 110 supervisor program
  else                 infoWord = 0x5;    // FC 101 supervisor data
  if (r_w == READ) infoWord |= 0x10;
  put(..., infoWord, WORD);
}
SR = SR | sbit;  SR = SR & ~tbit;  trace_bit = false;
```

**Group 1 and 2 frames** are 6 bytes: SR at SP, PC at SP+2. The SR pushed is the SR from before the exception.

**The group 0 frame** is 14 bytes, laid out as on a real 68000:

| Offset | Contents             |
| ------ | -------------------- |
| SP+0   | Special status word  |
| SP+2   | Access address       |
| SP+6   | Instruction register |
| SP+8   | SR                   |
| SP+10  | PC                   |

Differences from a real 68000 in the special status word:

- The I/N bit (bit 3) is never set.
- The function code is always a supervisor one (5 or 6), even when the fault happened in user mode.
- **Bus errors always pass `WRITE`, even for reads**, so R/W reads 0 (SIM/UTILS.CPP:259, 275, 290, 305, 457, 472).
- Address errors pass the correct direction: `READ` from `mem_req`, `WRITE` from `mem_put`.
    - However, MOVE and other instructions read the destination before writing it (`eff_addr` calls `mem_req` for the destination too, SIM/RUN.CPP:145-151, 170-176 and so on).
    - So a write to an odd address usually faults as a **read**.
- The instruction register field holds the global `inst`. After a failed fetch at an odd PC, that is the opcode of the previous instruction.

**Order of operations.** The vector is read into PC _before_ the frame is pushed (`mem_req(vec, LONG, &PC); exceptionHandler(...)`).
Vector reads go through `mem_req`, so the odd-address and Invalid/Protected checks apply to them too.

### What runs after each instruction when exceptions are ON (SIM/RUN.CPP:862-931)

1. `OLD_PC = PC` (the address after the instruction).
2. `BAD_INST` or `NO_PRIVILEGE` is taken.
3. If a pending IRQ is above the mask (or is level 7), `irqHandler()` takes it.
4. If T was set before the instruction and no exception in steps 2-3 cleared `trace_bit`, the trace exception is taken, then `OLD_PC = PC`.
5. Then STOP, TRAP, DIV0, CHK, TRAPV, `TRACE_EXCEPTION`, Line A or Line F is handled.

Address and bus errors raised inside the instruction have already been handled by step 1.
An interrupt pending at that point is then taken on top, which is fine: its frame returns into the address-error handler.

Bugs in this ordering. Do not copy them.

- **An IRQ taken alongside TRAP, DIV0, CHK, TRAPV, Line A or Line F is lost.** `OLD_PC` is not refreshed after `irqHandler`.
  The second exception overwrites PC and pushes the same return PC, so the interrupt handler never runs and its 6-byte frame is left orphaned on the stack.
- **An IRQ taken alongside BAD_INST** returns to the illegal instruction itself, because `OLD_PC` was already rewound.
  The illegal-instruction handler is skipped and its frame is orphaned.
- **Trace + TRAP** pushes the trace frame first and the TRAP frame second. The TRAP handler therefore runs first and returns into the trace handler.
  A real 68000 does the reverse.

### When the vector is unset, zero or odd

- **Unset vectors read $FFFFFFFF**, so the jump goes to an odd PC. The next opcode fetch raises an address error.
  Vector 3 is also $FFFFFFFF, so a second consecutive address error follows, and the simulator halts with
  **"Address or Bus error during exception processing. Execution halted"** (SIM/RUN.CPP:652-655).
    - Mechanism: at the start of `exec_inst`, `errflg` is set if the _previous_ result was `ADDR_ERROR` or `BUS_ERROR`.
      It is cleared again if the current instruction ends any other way (SIM/RUN.CPP:758-761, 855-857).
    - So the simulator halts after **two consecutive steps that both end in an address or bus error**. This is its only "double fault" model.
- **Vector = 0**: there is no check. Execution simply continues at $000000.
- **Odd SSP, or SSP outside 0..$1000000.** The handler prints "Error during Exception Handler: SSP odd or outside memory space"
  and stops (`trace = true`) without pushing anything. PC is already the handler address (SIM/RUN.CPP:1043-1052).

### The "Enable Exceptions" option

- It is the global `exceptions` (SIM/var.h:59).
- **The default is OFF** (SIM/SIM68Ku.cpp:1495). The shipped settings file also has it off (`SIM/sim68K.dat`: `0$exceptions`).
- Ways to turn it on:
    - Options menu, which toggles it and saves the setting (SIM/SIM68Ku.cpp:1271-1281)
    - `/e` on the command line (SIM/SIM68Ku.cpp:1231-1233)
    - TRAP #15 task 32 with `D1.B=5`, which also saves the setting to `sim68K.dat` (SIM/CODE9.CPP:924-928)
- No trap task turns it off.

**When OFF**, every non-`SUCCESS` result halts with a message in the Message window (SIM/RUN.CPP:933-1000):

| Result                        | Message                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Illegal                       | "Illegal instruction found at location %4x. Execution halted"                               |
| Privilege                     | "supervisor privilege violation at location %4x. Execution halted"                          |
| CHK                           | "CHK exception occurred at location %4x. ..."                                               |
| STOP                          | "STOP instruction executed at location %4x. Execution halted", and the hardware is disabled |
| TRAP                          | "TRAP exception occurred at location %4x. ..."                                              |
| TRAPV                         | "TRAPV exception occurred ..."                                                              |
| Divide by zero                | "Divide by zero occurred ..."                                                               |
| Trace exception code          | "Trace exception occurred ..."                                                              |
| Line A                        | "Line 1010 Emulator exception occurred ..."                                                 |
| Line F                        | "Line 1111 Emulator exception occurred ..."                                                 |
| Anything else                 | "Unknown execution error %4x occurred at location %4x."                                     |
| SR.T set after an instruction | "TRACE exception occurred at location %4x. Execution halted" (SIM/RUN.CPP:994-999)          |

- **Address and bus errors with exceptions OFF:**
    - `mem_req`/`mem_put`/`memoryMapCheck` call `haltSimulator()` and print "Address Error: Instruction at %4x accessing address %4x"
      or "Bus Error: Instruction at %4x accessing address %4x" (SIM/UTILS.CPP:358-362, 434-438, 260-264).
    - "Execution halted" follows (SIM/RUN.CPP:971-976).
    - `haltSimulator()` also disables the hardware (SIM/RUN.CPP:1121-1127).
- **Interrupts are never serviced while OFF**: the IRQ check sits inside `if (exceptions)`.
- TRAP #15 I/O keeps working while OFF.

## 3. TRAP #15 versus TRAP #0-#14

- `TRAP()` (SIM/CODE9.CPP:723-1283):
    ```c
    vector = inst & 0x0F;
    if(vector == 15) {
      switch ((char)D[0]) { ... }
    }
    ```
- **TRAP #15 is always the simulator I/O trap.** That holds whether exceptions are on or off, whatever vector 47 contains, and in user mode too.
    - There is no privilege check.
    - The task number is the **signed low byte of D0**, so tasks of 128 and above are negative and fall to `default`.
    - A known task returns `SUCCESS` and **costs 0 cycles** (there is no `inc_cyc` anywhere in `TRAP()`).
    - An unknown task returns `TRAP_TRAP` (SIM/CODE9.CPP:1277-1278). With exceptions on, that goes through vector 47 at $BC; with them off, it halts with "TRAP exception occurred".
- **TRAP #0-#14 return `TRAP_TRAP`** (SIM/CODE9.CPP:1281-1282).
    - Exceptions on: `mem_req(128 + (inst & 0x0f) * 4, ...)` loads vectors 32-46 ($80-$B8), at 38 cycles (SIM/RUN.CPP:903-906).
    - Exceptions off: halt with "TRAP exception occurred at location %4x".
- Task list, documented in the comment at SIM/CODE9.CPP:232-720 and in HELP:
    - 0-25: text I/O
    - 30-33: environment
    - 40-43: serial
    - 50-59: files
    - 60-62: mouse and keyboard IRQ
    - 70-77: sound
    - 80-96: graphics
    - 100-107: network
- Task 9 ends the program: AutoTrace off, `trace = false`, `halt = true`, hardware disabled, log stopped (SIM/CODE9.CPP:783-789).

## 4. Supervisor and user mode

- **Separate stacks.** `A[7]` is the USP and `A[8]` the SSP. `a_reg(7)` picks between them using SR.S at every use (SIM/UTILS.CPP:229-237).
  A MOVE to SR or an RTE that clears S switches A7 to the USP automatically.
- **Privileged instructions.** Each returns `NO_PRIVILEGE` when SR.S=0.

| Instruction                                                                   | Source                |
| ----------------------------------------------------------------------------- | --------------------- |
| MOVE to SR (checked before the EA is fetched)                                 | SIM/CODE1.CPP:235-247 |
| MOVE USP (both directions)                                                    | SIM/CODE1.CPP:350-370 |
| ANDI to SR                                                                    | SIM/CODE6.CPP:122-136 |
| ORI to SR                                                                     | SIM/CODE6.CPP:246-247 |
| EORI to SR                                                                    | SIM/CODE6.CPP:345-346 |
| RTE                                                                           | SIM/CODE8.CPP:237-238 |
| RESET                                                                         | SIM/CODE9.CPP:183-184 |
| STOP (checked **after** the immediate is fetched, and again after loading SR) | SIM/CODE9.CPP:206-221 |

- **Not privileged:**
    - MOVE from SR, which is correct for a 68000 (SIM/CODE1.CPP:205-215)
    - MOVE to CCR (SIM/CODE1.CPP:220-230)
    - ANDI/ORI/EORI to CCR (SIM/CODE6.CPP:107-119)
    - TRAP #15
- **PC pushed on a privilege violation.** It is the PC at the point of detection, because `exec_inst` does not rewind it (SIM/RUN.CPP:873-876):
    - opcode+2 for MOVE to SR, ANDI/ORI/EORI to SR, RTE, RESET and MOVE USP
    - opcode+4 for STOP

    A real 68000 pushes the address of the instruction itself.

- **TRAP #15 works in user mode.** The `TRAP()` code has no S check.
- The program starts in supervisor mode (SR=$2000).
- **Protected memory decides "supervisor" from the GUI, not the CPU.** It reads the SR text field: `Form1->regSR->EditText[3] == '0'`
  (SIM/UTILS.CPP:287, 469). During a full-speed run that field is stale, because `scrshow()` runs only when tracing or halted (SIM/RUN.CPP:697-705). This is a bug.

## 5. RTE, STOP and RESET

### RTE (SIM/CODE8.CPP:233-248)

- Privileged.
- Pops SR (word), then PC (long), from `A[8]` using `mem_request`, so odd-address checks apply. Costs 20 cycles.
- Always pops the short frame. Like a real 68000, a group 0 handler must add 8 to SP itself before RTE.
- RTR pops CCR and PC from the current A7 (SIM/CODE8.CPP:252-265).

### STOP #imm (SIM/CODE9.CPP:196-230)

```c
inc_cyc (4);
mem_request (&PC, WORD, &temp);          // PC now past the immediate
if (!(SR & sbit)) return NO_PRIVILEGE;
tr_on = SR & tbit;
SR = temp & WORD_MASK;  if (tr_on) SR |= tbit;   // T bit is preserved
if (!(SR & sbit)) return NO_PRIVILEGE;   // loading S=0 is a privilege violation
if (tr_on) return TRACE_EXCEPTION;
return STOP_TRAP;
```

Quirks:

- A T bit that was already set survives the load.
- An immediate with S=0 raises a privilege violation, where a real 68000 would stop in user mode.
- With T set, the trace exception is taken twice: once through `trace_bit` and once through `TRACE_EXCEPTION` (SIM/RUN.CPP:882-888, 919-922).

**With exceptions ON** (SIM/RUN.CPP:892-902):

- The result sets `halt = true` and `stopInstruction = true`, and prints "STOP instruction. Execution halted" (only the first time).
- **The run loop stops.** `runprog` deliberately leaves the auto-IRQ timers running while `stopInstruction` is set (SIM/RUN.CPP:699-700).

**Waking up** is done by `THardware::IRQprocess` (SIM/hardwareu.cpp:757-775):

```c
if (irqN > 0) irq |= (0x01 << (irqN-1));
if (stopInstruction) {                           // CPU halted after STOP
  intMask = 0xFF80 >> (7 - ((SR & intmsk) >> 8)) | 0x40;
  if (!( irq & intMask)) return;                 // masked: stay stopped, IRQ stays latched
}
inc_cyc (44);
if (!trace) runMode = true;
if (runMode) Form1->runLoop();
```

- When an unmasked IRQ arrives, the run loop restarts by **executing the instruction after STOP**.
  The IRQ is taken only at the check that follows that instruction.
  So one instruction after STOP always runs before the ISR, and the pushed PC points after that instruction.
  (The usual idiom `STOP` / `BRA loop` hides this.)
- **`stopInstruction` is never cleared by a wake-up.** Only the Reset button (SIM/hardwareu.cpp:788) and `initSim` clear it.
  As a result, later STOPs print no message, and runs stopped by a breakpoint keep their timers on.
- The user can also press **Run**, and execution continues after the STOP.

**With exceptions OFF**, STOP halts with a message and disables the hardware, so nothing can wake it (SIM/RUN.CPP:950-958).

### RESET instruction (SIM/CODE9.CPP:180-192)

- Privileged.
- Costs `inc_cyc(132)`.
- Otherwise a **no-op**. The comment says "assert the reset line to reset external devices", but nothing is done.

### Hardware window "Reset" button (`ResetBtnClick`, SIM/hardwareu.cpp:778-792)

- Works only while the hardware is enabled.
- Sets S=1, clears T, sets the interrupt mask to 7.
- Loads `SSP = long @ $0` and `PC = long @ $4`.
- Adds 40 cycles and clears `stopInstruction`.
- Calls `IRQprocess(0)`, which adds another 44 cycles and resumes running unless tracing.
- Registers, memory and pending IRQs are left alone.

## 6. Trace mode (T bit)

- **Implemented.** `trace_bit` is sampled from SR before each instruction executes (SIM/RUN.CPP:847-850).
- After the instruction it takes the trace exception through $24 at 34 cycles, then sets `OLD_PC = PC` (SIM/RUN.CPP:882-888).
- Any exception taken during the instruction clears `trace_bit` and so suppresses the trace (SIM/RUN.CPP:1079):
  illegal, privilege, an interrupt, an address error or a bus error.
- An RTE that sets T does not trace itself, because the sample was taken before it ran. That matches the 68000.
- With exceptions OFF, a set T bit halts with "TRACE exception occurred" (SIM/RUN.CPP:994-999).
- This is separate from the GUI's Step and Trace features (`trace`/`sstep` globals).

## 7. Interrupts

### Model

- `int irq` is a bitmask: bit n-1 means level n is pending (SIM/var.h:136).
- Requests are **latched**. A bit stays set until that level is serviced, or until `initSim`.

### When an interrupt is taken

- Only **between instructions**, inside `exec_inst`, after the current instruction has run, and **only when exceptions are ON** (SIM/RUN.CPP:878-880).
- The mask test is `intMask = 0xFF80 >> (7 - mask) | 0x40;`
    - a level is taken if it is above the mask
    - level 7 is always taken (non-maskable), but it is latched like the other levels rather than edge-triggered
- `irqHandler` (SIM/RUN.CPP:1083-1117):
    - pushes a 6-byte frame holding the old SR
    - sets S and clears T
    - sets the SR mask to the level being serviced
    - loads PC from the **autovector** at `$60 + 4*level` ($64..$7C)
    - clears that pending bit
    - adds 34 cycles
- **Priority:** the highest pending level wins. At most one interrupt is taken per instruction step.
- **Cost:** `IRQprocess` adds 44 cycles when the request is made, and the handler adds 34 when it is serviced.

### Sources

All of them call `Hardware->IRQprocess(level)`, which does nothing while the hardware is disabled.
The hardware is disabled after SIMHALT, task 9, `haltSimulator()`, or STOP with exceptions off.

- **Hardware window IRQ1-IRQ7 buttons:** `OnClick = IRQn` (SIM/hardwareu.dfm:2067-2853).
- **Auto IRQ timers:** `IRQ1timer..IRQ7timer`, `OnTimer = IRQn` (SIM/hardwareu.dfm:4913-4951).
    - They are VCL `TTimer`s, so they run on **wall-clock milliseconds**. No `Interval` is set in the .dfm, so the VCL default of 1000 ms applies until changed.
    - They are enabled per level by a checkbox, and only while running: `autoIRQon` on Run (SIM/SIM68Ku.cpp:453, SIM/hardwareu.cpp:811-822).
    - They are turned off on Pause, trace or halt, except after a STOP (SIM/RUN.CPP:697-700, SIM/SIM68Ku.cpp:538).
    - Loading a program clears the checkboxes (SIM/hardwareu.cpp:44-63).
- **Keyboard:** key down and key up in the output window (SIM/simIOu.cpp:417-426, 452-459).
- **Mouse:** button down, button up and move in the output window (SIM/simIOu.cpp:694-695, 760-761, 787-788).

Quirk: when the hardware is enabled and the program is not being traced, an IRQ sets `runMode = true` and starts `runLoop`.
So pressing an IRQ button on a program that is loaded but not running **starts it running**.

### TRAP #15 task 60, mouse IRQ (SIM/CODE9.CPP:1066-1076)

```c
mouseIRQ = (byte)(D[1] >> 8);  if (mouseIRQ > 7) break;   // whole call ignored
if (D[1] & 1) mouseDownIRQ = mouseIRQ;
if (D[1] & 2) mouseUpIRQ   = mouseIRQ;
if (D[1] & 4) mouseMoveIRQ = mouseIRQ;
```

- The level is `D1` bits 15-8. A value of 0 turns off the selected events.
- Events whose bit is not set keep their previous level.
- All three levels are reset to 0 by `initSim` (SIM/STARTSIM.CPP:116-120).

### TRAP #15 task 62, keyboard IRQ (SIM/CODE9.CPP:1131-1139)

- Same encoding as task 60, with bit 0 = key down and bit 1 = key up.
- The key code is then read with task 19.

### Task 61, mouse read (SIM/CODE9.CPP:1077-1128)

- `D1.B` selects the state to read: 0 = current, 1 = last button-up, 2 = last button-down.
- Result in `D0` bits: 0 = left, 1 = right, 2 = middle, 3 = double-click, 4 = Shift, 5 = Alt, 6 = Ctrl.
- Result in `D1.L` = `(Y << 16) | X`.

### TRAP #15 task 32, hardware (SIM/CODE9.CPP:906-936)

The subfunction is the signed low byte of D1.

| `D1.B` | Effect                                                                  |
| ------ | ----------------------------------------------------------------------- |
| 0      | Show the Hardware window                                                |
| 1      | `D1.L` = 7-segment display address                                      |
| 2      | `D1.L` = LED address                                                    |
| 3      | `D1.L` = toggle-switch address                                          |
| 4      | `D1.L` = `VERSION` = `$00051001` (SIM/def.h:24)                         |
| 5      | `exceptions = true`, menu checked, settings saved                       |
| 6      | `Hardware->setAutoIRQ((uchar)D2, D3)`, detailed below                   |
| 7      | `D1.L` = push-button address (in code, though not in the comment block) |
| other  | Nothing                                                                 |

`setAutoIRQ` (SIM/hardwareu.cpp:831-903):

- `D2.B = 0`: disable all auto IRQs and uncheck every box.
- `$01-$07`: disable that level.
- `$81-$87`: set that level's interval to `D3.L` milliseconds and check its box. While the program is running, checking the box starts the timer (SIM/hardwareu.cpp:1346-1392).
- Any other value: ignored.

### Hardware devices

**Default addresses** (SIM/SIM68Ku.cpp:1518-1521; also in the shipped `sim68K.dat`):

| Device            | Address  |
| ----------------- | -------- |
| 7-segment display | `E00000` |
| LEDs              | `E00010` |
| Toggle switches   | `E00012` |
| Push buttons      | `E00014` |

- The user can change each address in the Hardware window (6 hex digits).
- The addresses are saved to `sim68K.dat` (SIM/SIM68Ku.cpp:1463-1466).
- An address that conflicts with another device is shown in red but not rejected (SIM/hardwareu.cpp:676-712).
- The constant `SWITCH_ADDR = 0xE0000A` at SIM/hardwareu.cpp:25 is unused.

**7-segment display** (SIM/hardwareu.cpp:223-506):

- 8 digits, one byte each, at `seg7 + 0, 2, 4, …, 14` (even addresses). Digit k from the left is at `seg7 + 2k`.
  The leftmost shape `seg7a` has `Left=12` in the .dfm, and HELP/SIMHELP/Hardware.htm gives the same table.
- Segment bits: bit 0 = a, 1 = b, 2 = c, 3 = d, 4 = e, 5 = f, 6 = g, 7 = h (decimal point).
- The odd bytes in between are ignored.

**LEDs:** one byte; bit n lights LED n. LED7 is leftmost and LED0 rightmost (SIM/hardwareu.cpp:508-544).

**Toggle switches:** one byte; bit n = 1 while switch n is up. Switch 7 is leftmost.
The byte is set to 0 on load and when the window is shown (SIM/hardwareu.cpp:66-201).

**Push buttons:** one byte, **active low**. A press clears the bit and a release sets it, by mouse or key (SIM/hardwareu.cpp:994-1290).
Initial value $FF. Button 7 is leftmost.

**How the devices are memory-mapped:**

- They are plain RAM bytes. **Reads are not intercepted.**
- The GUI writes switch and button state straight into `memory[]`.
- Every `mem_put` ends with `Hardware->updateIfNeeded(loc)` (SIM/UTILS.CPP:396). That repaints the display when `loc` falls in
  `seg7-4..seg7+15` or `LED-4..LED` (SIM/hardwareu.cpp:204-212).
- The device addresses (`seg7..seg7+15`, LED, switch, pb) are **exempt from the memory-map checks** (SIM/UTILS.CPP:250-253, 447-449).

## 8. Cycle counting

**The counter** is `unsigned __int64 cycles` (SIM/var.h:58), incremented only by `inc_cyc(n)` (SIM/UTILS.CPP:165-170).

- Task 30: `cycles = 0` (SIM/CODE9.CPP:897-899).
- Task 31: `D1.L = cycles`, or **0 if cycles > $FFFFFFFF** (SIM/CODE9.CPP:900-905).
- The Clear Cycles button also zeroes it (SIM/SIM68Ku.cpp:1256-1262).
- The display reads "Overflow" above 48 bits (SIM/STARTSIM.CPP:152-155).

**Per-instruction timing** is table-driven, from Motorola's 68000 timing tables:

| What                                                                       | Cycles                                                                                                                                    | Source                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| EA calculation, added by `eff_addr(..., add_times=true)`, byte/word ÷ long | Dn/An 0; (An) 4/8; (An)+ 4/8; −(An) 6/10; d16(An) 8/12; d8(An,Xn) 10/14; abs.W 8/12; abs.L 12/16; d16(PC) 8/12; d8(PC,Xn) 10/14; #imm 4/8 | SIM/RUN.CPP:113-373 (`bwinc`/`linc`) |
| MOVE                                                                       | Full 12×9 tables by source and destination mode, with separate B/W and L tables                                                           | SIM/CODE1.CPP:26-53, 101-107         |
| MOVEA                                                                      | Same tables                                                                                                                               | SIM/CODE1.CPP:183-187                |
| MOVEM                                                                      | Base by mode, plus 4 (word) or 8 (long) per register                                                                                      | SIM/CODE1.CPP:59-63, 291-303         |
| ADD, SUB and similar                                                       | Motorola base (for example ADD <ea>,Dn: 4 for .B/.W, 6 or 8 for .L) plus EA                                                               | SIM/CODE3.CPP:66-77                  |
| Register shifts                                                            | 6 + 2n (.B/.W) or 8 + 2n (.L)                                                                                                             | SIM/CODE7.CPP:54-57                  |
| Memory shift                                                               | 8 + EA                                                                                                                                    |                                      |
| MULU                                                                       | 38 + 2·(number of ones)                                                                                                                   | SIM/CODE4.CPP:311-320                |
| MULS                                                                       | 38 + 2·(number of bit transitions, computed slightly wrong)                                                                               | SIM/CODE4.CPP:274-286                |
| DIVU / DIVS                                                                | **Exact**, using Jorge Cwik's algorithm                                                                                                   | SIM/CODE4.CPP:21-174, 206, 251       |
| Bcc                                                                        | Taken 10; not taken 8 (.S) or 12 (.W)                                                                                                     | SIM/CODE8.CPP:38-45                  |
| DBcc                                                                       | 12 (condition true), 14 (counter expired), 10 (branch)                                                                                    | SIM/CODE8.CPP:64-75                  |
| BRA / BSR                                                                  | 10 / 18                                                                                                                                   |                                      |
| JMP / JSR                                                                  | By mode                                                                                                                                   | SIM/CODE8.CPP:167-226                |
| RTS / RTE / RTR / NOP                                                      | 16 / 20 / 20 / 4                                                                                                                          |                                      |

**Exception cycles** (SIM/RUN.CPP:868-930, 1059, 1116; SIM/hardwareu.cpp:768, 787):

| Exception                                        | Cycles                                   |
| ------------------------------------------------ | ---------------------------------------- |
| Illegal, privilege, trace, TRAPV, Line A, Line F | 34                                       |
| TRAP                                             | 38 (the manual says 34)                  |
| Divide by zero                                   | 42                                       |
| CHK                                              | 44                                       |
| Interrupt                                        | 34 when serviced, plus 44 when requested |
| Address or bus error                             | 50                                       |
| RESET instruction                                | 132                                      |
| Reset button                                     | 40, plus 44 from `IRQprocess(0)`         |
| STOP                                             | 4                                        |
| TRAP #15 task                                    | **0**                                    |

**Accuracy:**

- Per size and per EA mode, using the documented tables.
- No prefetch or bus-cycle modelling, no wait states.
- A few approximations, for example TST is always 4, and CLR/NEG to memory is 8 or 12 plus EA.

## 9. Memory map

**Types:** `enum maptype {Invalid=0x01, Protected=0x02, Read=0x04, Rom=0x10}` (SIM/def.h:27).

**How it is configured:**

- **Hardware window, "Memory Map" box.** Each type has a checkbox and a Start/End pair of 6 hex digits; the top byte is fixed at 00
  (SIM/hardwareu.dfm:4173-4790; handlers SIM/hardwareu.cpp:1395-1464).
    - Defaults: all off, with ranges 0..0 (SIM/hardwareu.cpp:32-34).
    - The map is not saved to `sim68K.dat` (`SaveSettings` has no map fields, SIM/SIM68Ku.cpp:1430-1485).
- **Assembler `MEMORY ROM|READ|PROTECTED|INVALID start,end`** (ASM/DIRECTIV.CPP:899-991; values are masked to 24 bits).
    - It is written out as extra S0 records (ASM/OBJECT.CPP:279-341).
    - The loader sets that type's checkbox and range only for files with the EASy68K header. A file with no map leaves the existing map in place (SIM/SIMOPS2.CPP:258-280).

**Semantics:**

- Writes go through `memoryMapCheck(Invalid|Protected|Read|Rom, ...)` (SIM/UTILS.CPP:246-321, called at 372).
- Reads are checked inside `mem_req` (SIM/UTILS.CPP:447-482).
- Checks run in this order (HELP/SIMHELP/Hardware.htm states the same):
    1. **Hardware** device addresses: always allowed.
    2. **Invalid**: any access raises a bus error.
    3. **Protected**: a bus error if not in supervisor mode. The supervisor test reads the GUI SR text field; see Q4.
    4. **Read** (read-only): a write raises a bus error; reads are fine.
    5. **ROM**: writes are silently ignored (`mem_put` returns `SUCCESS` without writing, SIM/UTILS.CPP:375-376); reads are fine.
- **How ranges are tested:**
    - Writes use an overlap test, `loc+bytes-1 >= Start && loc <= End`.
    - Reads test only the start byte.
- **Bus error handling:**
    - Exceptions on: vector $08 with a 14-byte frame (always marked as a write, see Q2).
    - Exceptions off: `haltSimulator()` and "Bus Error: Instruction at %4x accessing address %4x".
- **TRAP #15 buffers are checked too.**
    - Tasks that read strings or buffers check `Invalid`, for example SIM/CODE9.CPP:741, 816, 1029.
    - Task 53 (read file into memory) checks `Invalid|Read|Rom`.
    - The Protected and Read checks are not applied to those string reads.
- **A `mem_put` bus error does not stop the instruction.** `put()` returns `void`, so the instruction completes, returns `SUCCESS`, and the handler runs next. The pushed PC is instruction address + 2.

## 10. Running into $FF-filled memory; how SIMHALT is detected

`$FFFF` decodes as `LINE_1111` (SIM/OPCODES.H:136). `LINE1111()` is at SIM/CODE9.CPP:1305-1322:

```c
mem_req (PC, WORD_MASK, &temp);                 // peek next word, PC not advanced
if(inst == 0xFFFF && temp == 0xFFFF && simhalt_on) {
  PC += 2;                                      // PC = after the $FFFF FFFF pair
  AutoTraceTimer off; trace = false; halt = true;
  Hardware->disable(); Log->stopLogWithAnnounce();
  return SUCCESS;
}
return LINE_1111;
```

- **Falling off the end of a program into erased memory halts quietly, exactly as SIMHALT does.**
    - No error and no message line is printed. While tracing, the step line reads `... SIMHALT` (SIM/RUN.CPP:772-774).
    - The hardware is disabled, so IRQs and the Reset button stop working.
    - Per the help, Pause re-enables the controls and execution can continue after the SIMHALT (HELP/Directives/simhalt.htm).
- **When it is a Line-F exception instead:**
    - `$FFFF` followed by any other word.
    - A listing that contains `*[sim68k]SIMHALT_OFF`, which sets `simhalt_on = false` (SIM/SIM68Ku.cpp:334-336).
    - Line F then goes through vector $2C if exceptions are on, or halts with "Line 1111 Emulator exception occurred" if off.

## 11. Address error: odd data access and odd PC

- **Data.** `(loc % 2 != 0) && size != BYTE_MASK` is checked before the 24-bit mask, in both `mem_req` (reads, SIM/UTILS.CPP:427-440) and `mem_put` (writes, SIM/UTILS.CPP:352-364).
    - Exceptions on: vector $0C with the 14-byte frame.
    - Exceptions off: `haltSimulator()`, "Address Error: Instruction at %4x accessing address %4x", then "Execution halted".
- **Odd PC.** JMP, JSR, Bcc, RTS, RTE and exception vectors all load PC **without a check** (for example SIM/CODE8.CPP:165, 208, 242, 272).
    - The error is raised at the **next opcode fetch**: `mem_request(&PC, …)` calls `mem_req` with an odd address (SIM/RUN.CPP:761).
    - Frame contents: PC = the odd PC; access address = the odd PC; FC = supervisor program (6) with R/W = read, so the status word is $16; IR = the previous instruction's opcode.
    - So it is an exception when exceptions are on, and a halt when they are off.
- **Byte access to (A7)+ or −(A7)** moves A7 by 2 (SIM/RUN.CPP:159-161, 185-187).

## 12. Non-68000 instructions; unknown opcodes

- **Only 68020 bit-field instructions** (BFCHG, BFCLR, BFEXTS, BFEXTU, BFFFO, BFINS, BFSET, BFTST) are executed, and only when `bitfield` is on.
  (SIM/OPCODES.H:133; SIM/CODE7.CPP:313-493; gate at 326-327: `if (!bitfield) return BAD_INST`.)
    - Off by default (SIM/SIM68Ku.cpp:1496).
    - Turned on by the menu, `/b`, or `*[sim68k]bitfield` in the listing. The assembler writes that tag for `OPT BIT` (ASM/DIRECTIV.CPP:620-625).
    - Only 68000 addressing modes are supported (HELP/SIMHELP/SimOptions.htm).
- **Not present:** MOVE from CCR, EXTB, MOVEC, MOVES, RTD, BKPT, CHK.L and other 68010/68020 instructions. How they decode:

| Opcode                                 | Decodes as | Result                                                        |
| -------------------------------------- | ---------- | ------------------------------------------------------------- |
| `$42C0` (MOVE from CCR)                | CLR        | Size field 11 is rejected, so `BAD_INST`                      |
| `$49C0` (EXTB.L)                       | LEA        | Dn is not a control mode, so `BAD_INST` (SIM/CODE2.CPP:64-65) |
| `$4E74` (RTD), `$4E7A`/`$4E7B` (MOVEC) | Nothing    | No table match, so `BAD_INST` (SIM/RUN.CPP:1003-1004)         |

- **Unknown opcode**, or an illegal size or EA mode, returns `BAD_INST`:
    - Exceptions on: illegal instruction through vector $10, pushed PC = PC-2.
    - Exceptions off: "Illegal instruction found at location %4x. Execution halted".
- The assembler rejects these instructions too. Their entries are commented out: ASM/INSTTABL.CPP:469 (MOVE CCR,<ea>), 479-484 (MOVEC), 497-500 (MOVES), 576-578 (RTD), 832, 836 and 859.

---

# Assembler

## 13. Size selection, optimisations, passes

**Passes.** There are exactly two (ASM/ASSEMBLE.CPP:297-343). No relaxation, no further iterations.

**backRef.** Every operand expression carries a `backRef` flag: true when every symbol in it was defined **earlier in the source**.

- Pass 1: a symbol counts if it was found in the table.
- Pass 2: a symbol counts if its `BACKREF` flag is set, and that flag is set when the symbol's own line is reached in pass 2.
- Sources: ASM/EVAL.CPP:87, 112, 197, 328-329, 352; ASM/SYMBOL.CPP:251-259.

Because every size decision is a function of `backRef` and values, pass 1 and pass 2 choose the same sizes.
If a label's value nevertheless differs between the passes, the result is `PHASE_ERROR` (ASM/SYMBOL.CPP:252-257).
The one known trigger is a macro used before its definition (warning `FORWARD_REF`, ASM/INSTLOOK.CPP:129-130).

**Branches** (`branch()`, ASM/BUILD.CPP:562-593):

```c
disp = source->data - loc - 2;
if ( (size == SHORT_SIZE || size == BYTE_SIZE) ||
     (size != LONG_SIZE && size != WORD_SIZE && source->backRef &&
      disp >= -128 && disp <= 127 && disp) )
  shortDisp = true;
...
if (shortDisp) { output(mask | (disp & 0xFF)); if (disp < -128 || disp > 127 || !disp) error(INV_BRANCH_DISP); }
else           { output(mask); output(disp);  if (disp < -32768 || disp > 32767) error(INV_BRANCH_DISP); }
```

- **Unsized, backward target that fits in −128..127** → `.S`.
- **Unsized, forward target** → always `.W` (4 bytes).
- `.S` or `.B` → always short.
- `.W` or `.L` → 16-bit displacement. There is no 32-bit form; `.L` simply means `.W`.
- **`bra.s` with displacement 0 or out of range** is an _error_.
    - `INV_BRANCH_DISP` = $205, which is above `MINOR`, so it counts toward `errorCount` (ASM/ASSEMBLE.CPP:549-552).
    - The word `$6x00|disp` is still emitted. A displacement of 0 therefore assembles as `$6000`, which the CPU reads as a `.W` branch.
- DBcc always uses a word displacement (ASM/BUILD.CPP:685-706).
- The branch flavors accept Absolute operands only (ASM/INSTTABL.CPP:166-168 and the other `b*fl` lists).

**Absolute addresses** (ASM/OPPARSE.CPP:411-429):

- `addr.L` → `(xxx).L`.
- `addr.W` → `(xxx).W` forced. The value is truncated with `short(d->data)` and the warning "Forcing SHORT addressing disables range checking" is given.
- Unsized: **`(xxx).L` if not backRef, or if the value is outside −32768..32767; otherwise `(xxx).W`.**
    - So forward references are always long.
    - $8000-$FFFF is long.
    - $0-$7FFF and $FFFF8000-$FFFFFFFF (negative values) are short.
- **No absolute-to-PC-relative conversion** for LEA, PEA, JMP or JSR. PC-relative addressing is used only when written as `x(PC)` or `x(PC,Xn)`.

**Immediates:** `#n.L` sets the operand's `size = LONG_SIZE` "to prevent MOVEQ, ADDQ & SUBQ optimizations" (ASM/OPPARSE.CPP:100-104).

**Optimisations.** These are always on. There is no option for them: the Options dialog has only listing, S-record, warnings, bit-field, CRE, MEX, SEX and CEX (ASM/optionsS.cpp:64-101).
Each one requires `backRef` and no `#….L`.

| Source                                        | Becomes                        | Condition                                                                                              | Source                |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------- |
| `MOVE.L #n,Dn`                                | `MOVEQ`                        | −128 ≤ n ≤ 127, and the size must be **explicitly `.L`**. Unsized `MOVE` is `.W` and is not converted. | ASM/BUILD.CPP:68-74   |
| `ADD`/`ADDI`/`SUB`/`SUBI #n,<data-alterable>` | `ADDQ`/`SUBQ` of the same size | 1 ≤ n ≤ 8. Explicit `ADDI`/`SUBI` is converted too.                                                    | ASM/BUILD.CPP:305-320 |
| `ADD`/`ADDA`/`SUB`/`SUBA #n,An`               | `ADDQ`/`SUBQ`                  | 1 ≤ n ≤ 8, .W or .L                                                                                    | ASM/BUILD.CPP:175-197 |

There is nothing else: no CLR/TST substitution, no MOVEA-to-LEA, no JMP-to-BRA, no abs-to-PC-relative.

**Explicit quick instructions:**

- `MOVEQ` accepts −128..255 without error (ASM/BUILD.CPP:603-614).
- `ADDQ`/`SUBQ` outside 1..8 is an error.

**Unsized instructions default to `.W`** (`pickMask`, ASM/ASSEMBLE.CPP:792-803). A `.` followed by a space is also read as `.W` (ASM/INSTLOOK.CPP:77).

## 14. SIMHALT object code, DC alignment, listing format

**SIMHALT:**

- The directive word-aligns, then emits `$FFFF` `$FFFF` (4 bytes) (ASM/DIRECTIV.CPP:996-1020).
- It costs nothing at run time; the simulator detects it as described in Q10.

**Alignment:**

- Instructions: `if (loc & 1) loc++` (ASM/ASSEMBLE.CPP:618-621; MOVEM at ASM/MOVEM.CPP:78-81).
- `DC.W`/`DC.L`, `DCB.W`/`DCB.L` and `DS.W`/`DS.L` align to even (ASM/DIRECTIV.CPP:353-355, 462-464, 531-534).
- `.B` forms do not align.
- **The skipped pad byte is not emitted**, so in the simulator it keeps the $FF fill.
- `DS` emits no data at all; it only advances `loc`.
- An odd `ORG` is rounded up by one, with a warning (ASM/DIRECTIV.CPP:112-115).
- Unsized `DC`/`DS`/`DCB` default to `.W`.

**DC strings:** characters are packed into the unit size, and the last unit is zero-padded (`collect` appends NULs; ASM/DIRECTIV.CPP:369-387, 422-440).

**Listing (`.L68`)** (ASM/LISTING.CPP):

- Line 1: `XXXXXXXX Starting Address`. It is written as `00000000` first and patched with the END address at the end (107, 280-281).
- Then `Assembler used: EASy68K Editor/Assembler v5.16.01`, then `Created On: <date>`, then a blank line (109-110).
- **Each source line** has a fixed 32-character field (`%-32.32s`, 129), followed by `%6d  ` (line number), followed by the source with tabs expanded (157-159).
    - The 32-character field holds the address as `%08lX`, then two spaces. `DC`, `DCB`, `OFFSET` and similar use `=` plus a space instead of the two spaces (180-189).
      `EQU` and `SET` print `=VVVVVVVV` (ASM/DIRECTIV.CPP:279-282).
    - After the address comes the object code: `%04X ` for words, `%08lX ` for longs, `%02X ` for bytes (236-245).
    - Object code that does not fit is cut off with `...`. With `OPT CEX` it continues on extra lines instead (224-235).
    - The source text starts at **column 41**, which is where the simulator looks for `*[sim68k]` tags.
- Footer: `No errors detected` or `N error(s) detected`, then the warning count, then the symbol table if `OPT CRE` (255-277).
  The simulator relies on the exact text "No error".

**S-records** (ASM/OBJECT.CPP):

- An S0 header `68KPROG   20CREATED BY EASY68K` (160).
- S1, S2 or S3 records depending on how wide the address is, up to 32 data bytes each (170-231).
- Memory-map S0 records (279-341).
- An S8 record with the start address (346).

## 15. Encodings chosen when there are alternatives

Rule: `createCode` walks the instruction's flavor list **in order**, and the **first** flavor whose source and destination mode masks match is used (ASM/ASSEMBLE.CPP:628-703).
The flavor lists are in ASM/INSTTABL.CPP; the builders are in ASM/BUILD.CPP.

| Source line                                 | Encoding emitted                                                    | Why                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `add.w #5,d0`                               | `ADDQ.W #5,D0` = `$5A40`                                            | `addfl[1]` {IMM, DataAlt} → `immedInst` → ADDQ (INSTTABL:113-120, BUILD:305-320) |
| `add.w #100,d0`                             | **`ADDI.W`** `$0640 0064`, not `ADD #imm,Dn` (`$D07C`)              | Same flavor, no quick form                                                       |
| `add.l #100,a0`                             | `ADDA.L #100,A0` `$D1FC …`                                          | `addfl[0]` {All, An} → `arithReg`                                                |
| `add.w #3,a0`                               | `ADDQ.W #3,A0` `$5648`                                              | `arithReg` ADDA→ADDQ                                                             |
| `add.w d1,d0`                               | `$D041`, the `ADD <ea>,Dn` form                                     | `addfl[3]` {Data, Dn} comes before {Dn, MemAlt}                                  |
| `add.w d0,(a0)`                             | `$D150`, the `ADD Dn,<ea>` form                                     | `addfl[5]`                                                                       |
| `sub…`                                      | Same pattern as ADD                                                 | `subfl` (INSTTABL:665-672)                                                       |
| `cmp.w #5,d0`                               | **`CMP.W #5,D0` `$B07C 0005`, not CMPI**                            | `cmpfl[0]` {Data, Dn} → `arithReg` (INSTTABL:306-312)                            |
| `cmp.w #5,(a0)`                             | `CMPI.W` `$0C50 0005`                                               | `cmpfl[3]`                                                                       |
| `cmp.l d0,a0`                               | `CMPA.L` `$B1C8`                                                    | `cmpfl[2]`                                                                       |
| `cmp.b (a0)+,(a1)+`                         | `CMPM.B`                                                            | `cmpfl[4]`                                                                       |
| `and.w #$F,d0`                              | **`AND.W #imm,D0` `$C07C 000F`, not ANDI**                          | `andfl[0]` {Data, Dn} (INSTTABL:140-146)                                         |
| `and.w #$F,(a0)`                            | `ANDI.W`                                                            | `andfl[2]`                                                                       |
| `and #x,ccr` / `and #x,sr`                  | `ANDI to CCR` `$023C` / `ANDI to SR` `$027C`                        |                                                                                  |
| `or …`                                      | Same pattern as AND                                                 | `orfl` (INSTTABL:530-536)                                                        |
| `eor.w #1,d0`                               | `EORI.W` `$0A40` (EOR has no `<ea>,Dn` form)                        | `eorfl` (INSTTABL:410-413)                                                       |
| `move.l a0,d0`                              | `$2008`, a plain MOVE with An as source                             | `movefl[1]` {An, DataAlt}                                                        |
| `move.l d0,a0`                              | MOVEA.L `$2040`                                                     | `movefl[2]` {All, An}; MOVE and MOVEA share the mask                             |
| `move.l #5,d0`                              | `MOVEQ #5,D0` `$7A05`                                               | BUILD:68-74                                                                      |
| `move #5,d0`                                | `MOVE.W #5,D0` `$303C 0005`                                         | Unsized means .W, and only .L converts                                           |
| `move.l #5,a0`                              | `MOVEA.L #5,A0` `$207C 0000 0005`                                   | MOVEQ requires a Dn destination                                                  |
| `move sr,d0` / `move d0,sr` / `move d0,ccr` | `$40C0` / `$46C0` / `$44C0`                                         | `MOVE CCR,<ea>` is rejected; its flavor is commented out (INSTTABL:469)          |
| `move usp,a0` / `move a0,usp`               | `$4E68` / `$4E60`                                                   |                                                                                  |
| `lea label,a0`, `jsr label`                 | `abs.W` or `abs.L` by the backRef/range rule, **never PC-relative** | `jsr fwd` → `$4EB9 xxxx xxxx`                                                    |
| `btst d0,d1` / `btst d0,(a0)`               | `.L` on a Dn destination, `.B` on memory                            | `btstfl`                                                                         |
| `exg d0,a1`                                 | `$C189`. The address register goes in the low bits.                 | BUILD:773-792                                                                    |
| `movem`                                     | Always MOVEM, even with one register; unsized is .W                 | ASM/MOVEM.CPP:84-92                                                              |
| `tst`                                       | Data-alterable only (68000 rules)                                   | INSTTABL:716-718                                                                 |

---

## Behaviours to decide on: EASy68K bugs and quirks (copy or not)

1. **IRQ in the same step as TRAP, DIV0, CHK, TRAPV, Line A or Line F:** the interrupt is lost and its frame orphaned. **IRQ alongside BAD_INST** re-executes the illegal instruction. (Q2)
2. **Trace + TRAP order** is reversed from the 68000. **STOP with T set** takes the trace exception twice. (Q2, Q5)
3. **Line A, Line F and privilege violations push the PC after the opcode**, not the opcode's address. Illegal instructions do rewind by 2. (Q2, Q4)
4. **The bus-error status word always says "write"**; the I/N bit is never set; the FC is always supervisor. (Q2)
5. **Protected-region checks read the S bit from the GUI**, which is stale during a run. (Q4, Q9)
6. **STOP:**
    - one instruction after STOP runs before the ISR
    - `stopInstruction` is never cleared by an IRQ
    - Run continues past a STOP
    - S=0 in the immediate is a privilege violation
    - the T bit is kept

    (Q5)

7. **The RESET instruction is a no-op** apart from 132 cycles. The Reset button re-reads vectors 0 and 1. (Q5)
8. **Interrupts are serviced only with exceptions enabled**, and that option is OFF by default. TRAP #15 always works. (Q2, Q3, Q7)
9. **$FFFF $FFFF halts quietly.** Running off the end of a program into $FF memory looks like SIMHALT. (Q10)
10. **Both auto-IRQ timers and the IRQ-request cost (+44 cycles) are wall-clock or GUI driven**, not tied to the cycle count. (Q7, Q8)
11. **LINK and UNLK use `A[reg]`, not `A[a_reg(reg)]`,** so `LINK A7` / `UNLK A7` in supervisor mode touch the USP (SIM/CODE2.CPP:147-148, 166-167).
    **LEA returns a 24-bit-masked address**, except for abs.W, which is sign-extended (SIM/CODE2.CPP:68-70).

## Not found or not applicable

- No VBR, no vectored interrupts (vectors 64-255), no spurious or uninitialised-interrupt vectors, and no 68000 HALT pin state. These are absent from the code, not merely undocumented.
- The default interval of the auto-IRQ timers is not set in the .dfm. It is therefore the VCL `TTimer` default (1000 ms), stated from VCL knowledge rather than from this source.
- The serial, network, sound and graphics TRAP #15 tasks were not analysed beyond the task list. They are outside this question.
