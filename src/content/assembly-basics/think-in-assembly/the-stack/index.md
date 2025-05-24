In previous lectures, we saw that we have **registers** for quick, temporary calculations and **memory** for long-term
storage of code and data.

Now imagine you are writing a complex program. You have used up all the registers for your calculations, and now you
need to store some other temporary data somewhere else.

You could store the data you need somewhere in memory. To do that, however, you'd need to manually pick a memory
address, write the value there, and then remember that address for when you need the value back.
This would also not work very well for data that changes in size. Say for example you need to store in memory a sequence
of numbers, but you don't know how many numbers you will need to store, as that
size depends on user input. But then you also need to remember to not accidentally overwrite other data in memory that
you already stored somewhere... messy.

To make this easier, we can introduce the concept of the **stack**.
The stack is a special area in memory that is used to store temporary data in a very organized way. It allows you to
save and retrieve data without having to worry about memory addresses or overwriting other data.

The reason why it works well is that the stack can only grow or shrink in a specific way, which is called **LIFO** (
Last-In, First-Out).

Imagine the stack as a, well, stack of plates. You can only add or remove a plate from the top.

## How the Stack Works in Assembly

The stack itself is just a region of memory. Usually it is located "at the end" of the memory space and grows
downwards (this is just a convention).
It is located at the end and grows downwards so that it does not interfere with the rest of the memory. For example,
code is usually stored at the beginning of memory.

Remember! Everything is just bits. The stack is nothing fancy, it's just a region in memory, the way you use it is
completely up to you.

``` 
Low Address
--------------
| Code (text) |
| Data        |
|             |
|             |
| Stack       |  <-- Grows downward
--------------
High Address
```

## The Stack Pointer (SP)

As we mentioned before, the stack grows by adding or removing "plates" from the top of the stack.

We know that the stack grows at the very end of memory, and that it grows downwards. Now we just need to know the
address of where the "top of the stack" is located.

All assembly language have a specific register (or have a convention for it) that is used to keep track of the top of
the stack. This register is called the **Stack Pointer (SP)**.

Some assembly languages also have special instructions that make it easier to work with the stack, while others require
you to manually manage the stack pointer.

There are two operations that you can perform on the stack:

- **PUSH**: Add a new item to the top of the stack.
- **POP**: Remove the item from the top of the stack.

The way you do those two operations is by manipulating the Stack Pointer register.

### Push (add an item)

Say you want to add 1 byte of data to the stack:

1. You decrease the Stack Pointer by 1 byte (to make space for the new data).
2. You write the data to the memory location now pointed to by the Stack Pointer.

### Pop (remove an item)

When you want to "remove" data from the stack, you just need to decrease the Stack Pointer by the size of the data you
want to remove.
This will not actually "delete" the data itself (as in, erase the bits from memory), but since you are not "supposed to"
use
the memory that is beyond the Stack Pointer, you can consider it free space.

When you go and place data in the stack, you will overwrite that memory to store new data, so it is not a problem.

This should also give you a hint. The contents of memory that you have not yet written to can have ANY value in it, you
cannot
make any assumptions about it.

## Example

Let's say that the stack currently has two values: `0x11111111`, `0x22222222`.

And that our stack pointer is currently pointing at address `0x1018` (we will use the 🟢 emoji to indicate the top of the
stack)

Remember that the stack grows downwards, we will have:

|  address |     value     |
|---------:|:-------------:|
|   0x1000 |   ????????    |
|   0x1004 |   ????????    |
|   0x1008 |   ????????    |
|   0x100C |   ????????    |
|   0x1010 |   ????????    |
|   0x1014 |   ????????    |
|   0x1018 |  🟢 22222222  |
|   0x101C |   11111111    |

The "????????" means that we don't know what is there, it can be anything.

Now, if we want to push a new value, say `0x33333333`, we first decrese the stack pointer by 4 bytes (the size of the
number we are pushing):

|  address |     value     |
|---------:|:-------------:|
|   0x1000 |   ????????    |
|   0x1004 |   ????????    |
|   0x1008 |   ????????    |
|   0x100C |   ????????    |
|   0x1010 |   ????????    |
|   0x1014 |  🟢 ????????  |
|   0x1018 |   22222222    |
|   0x101C |   11111111    |

We now write the value `0x33333333` to the memory location pointed to by the Stack Pointer:

|  address |     value     |
|---------:|:-------------:|
|   0x1000 |   ????????    |
|   0x1004 |   ????????    |
|   0x1008 |   ????????    |
|   0x100C |   ????????    |
|   0x1010 |   ????????    |
|   0x1014 |  🟢 33333333  |
|   0x1018 |   22222222    |
|   0x101C |   11111111    |

Let's now add another value, say `0x4444`, that is 2 bytes long. We will decrease the Stack Pointer by 2 bytes:

|  address |    value     |
|---------:|:------------:|
|   0x1000 |   ????????   |
|   0x1004 |   ????????   |
|   0x1008 |   ????????   |
|   0x100C |   ????????   |
|   0x1010 |  ????🟢????  |
|   0x1014 |   33333333   |
|   0x1018 |   22222222   |
|   0x101C |   11111111   |

And we write the value `0x4444` to the memory location pointed to by the Stack Pointer:

|  address |    value     |
|---------:|:------------:|
|   0x1000 |   ????????   |
|   0x1004 |   ????????   |
|   0x1008 |   ????????   |
|   0x100C |   ????????   |
|   0x1010 |  ????🟢4444  |
|   0x1014 |   33333333   |
|   0x1018 |   22222222   |
|   0x101C |   11111111   |

As the last thing we do, let's pop the last value we pushed, which is `0x4444`. We do this by just increasing the Stack
Pointer by 2 bytes:

|  address |    value     |
|---------:|:------------:|
|   0x1000 |   ????????   |
|   0x1004 |   ????????   |
|   0x1008 |   ????????   |
|   0x100C |   ????????   |
|   0x1010 |   ????4444   |
|   0x1014 |  🟢33333333  |
|   0x1018 |   22222222   |
|   0x101C |   11111111   |

As you can see, the value `0x4444` is still in memory, but we are not supposed to use it anymore, as it is beyond the
Stack Pointer.

# Practical Example

Let's now do the same thing but in M68K assembly language.
Execute this code step by step and look at the memory to see how the stack is manipulated.

```m68k|playground|no-registers|memory|no-flags
* ignore this, it sets things up *
move.l #$11111111, $101C
move.l #$22222222, $1018
move.l #$1018, sp
* let's now start the example *

* let's push 0x33333333:
* first we decrease the stack pointer
sub #4, sp
* then we write the value
move.l #$333333333, (sp)

* let's push 0x4444
* first we decrease the stack pointer
sub #2, sp
* then we write the value
move.w #$4444, (sp)

* now we pop the last value
add #2, sp
```
