A trap is one way to reach a device: the program asks, the environment answers. There is a second
way, and it needs no new instruction at all.

## Some addresses are not memory

We said memory is a large array of bytes and that an address picks one of them. That was not the
whole truth. Whoever builds a machine decides what sits behind each address, and behind some of them
there is no memory cell, there is a **device**. Writing to such an address tells the device to do
something. Reading from it asks the device something. The load and store instructions you already
know are the entire interface.

That is **memory-mapped I/O**, and the list of which address ranges are real memory and which belong
to a device is the machine's **memory map**. A program that wants a device has to know the number:
there is no name, no handle and nothing to open, only an address that somebody wrote down in a
manual.

## The registers of a device

A device usually appears as a handful of addresses next to each other, and each one is called a
**register** of the device (a different thing from a CPU register, unfortunately sharing the word).
Three kinds turn up again and again:

- a **data register**: the byte that came in, or the byte you want to send out.
- a **status register**: what the device is doing at this instant, usually as single bits. The one
  that matters most is **ready**, which says whether there is a character waiting for you, or
  whether the device can take another one.
- a **control register**: how the device should behave, written by the program to set it up.

Reading a data register is often what clears the ready bit, because taking the character out is what
makes room for the next one. So one of these addresses does not behave like a variable: reading it
twice can give two different answers, and reading it once can change the device.

## Polling

A program cannot know when somebody is going to press a key. What it can do is read the status
register over and over until the ready bit turns on, and then read the data register. That loop is
called **polling**, or a **busy wait**:

```
poll:
    read the status register
    if the ready bit is 0, go back to poll
    read the data register, which is the character
```

It is a loop and a branch, the two things we already know how to write. It also burns the CPU
completely: while it spins, at full speed, nothing else gets done. That is the reason interrupts
exist, and they are the next lecture.

## A framebuffer

The device that suits this treatment best is the screen. A **framebuffer** is a run of memory in
which each element is one pixel, laid out row after row starting from a **base address**. If a pixel
takes 4 bytes and a row is `width` pixels across, then the pixel at column `x` and row `y` lives at:

```
base + (y * width + x) * 4
```

Write a colour there and that pixel changes, and nothing else needs to happen, because the display is
reading that memory continuously and drawing whatever it finds. Drawing a picture is a loop that
computes addresses, so the lectures on arrays, loops and shifts are already the whole toolkit (the
multiplication by 4 is usually written as a shift, and `y * width` too when the width is a power of
two).

Real graphics hardware works this way, and so does the bitmap display of the simulators in this
editor.

## Ports, a second address space

Some CPUs keep a separate address space for devices, with its own instructions to reach it. The Z80
has 256 of these **ports** and reads and writes them with `in` and `out`; x86 has 65536 and uses the
same two names. The port number picks the device the way an address picks a memory-mapped one.

That is **port-mapped I/O**. Nothing else about this lecture changes: there are still data, status
and control registers behind those numbers, and a program still polls a ready bit to know when to
read. The one practical difference is that a port can never be confused with memory, because a
different instruction reaches it.

## What this editor does

The MIPS and RISC-V simulators here map their devices into memory, at the addresses their manuals
give: a bitmap display whose base address and size you choose, and a keyboard behind four registers
in the region that starts at `0xffff0000`, laid out as the control and data pairs described above.
The M68K instead reaches its screen through trap tasks, one task per drawing operation, so there is
no address a program could write a picture into. The Z80 draws and reads its keyboard through ports.

The same device, then, is an address on one machine, a task number on another and a port number on a
third, while the middle part, working out which pixel to paint or which key was pressed, is the same
everywhere. Which of the three you have is the first thing to find out about a new machine, and each
language course starts its own outside-world module by saying so.
