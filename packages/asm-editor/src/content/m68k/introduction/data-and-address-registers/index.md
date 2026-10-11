# Data and address registers

The M68K processor has sixteen registers for everyday work. It divides them into two named groups:

- eight **data registers**, named `d0` through `d7`;
- eight **address registers**, named `a0` through `a7`.

The letter tells you the register's usual job. The number picks one register from that group. For
example, `d3` is data register 3 and `a3` is address register 3. They are two separate registers.

## Data registers

Data registers hold values that a program is working with. A value might be a score, a counter, a
price or the result of a calculation.

A program could use some data registers like this:

| register | value being kept there |
| -------- | ---------------------- |
| `d0`     | the current total      |
| `d1`     | the number of items    |
| `d2`     | the latest result      |

The meanings in the right-hand column come from the program. The register names themselves are
fixed: the programmer chooses what each data register will hold and keeps track of that choice.

## Address registers

Memory is made of many locations. Each location has an **address**: a number that identifies that
location. An address works like a numbered place where the processor can find some stored data.

Suppose memory location 1200 contains the value 25. These are two different numbers with different
jobs:

| place                         | value |
| ----------------------------- | ----: |
| address register `a0`         |  1200 |
| memory location numbered 1200 |    25 |

Here, `a0` holds the address 1200. That address tells the processor which memory location is of
interest. The data at that location is 25.

Address registers are used for location numbers like 1200. A program might use `a0` for the start
of some text and `a1` for the next memory location it plans to visit. This gives the processor one
group of registers for finding places in memory and another group for values used in calculations.

## `a7` and `sp`

The last address register has two names: `a7` and `sp`. Both names refer to the same visible
register. If its value changes under one name, the value shown under the other name changes too.

`sp` means **stack pointer**. The processor uses this register for stack bookkeeping, so reserve
`a7`/`sp` for that job. For ordinary addresses, choose from `a0` through `a6`.

## Check your understanding

For each job, choose **data register**, **address register**, or **`a7`/`sp`**.

1. Keep a running total.
2. Keep the number of the memory location where a message begins.
3. Keep count of how many items have been processed.
4. Handle stack bookkeeping.

Then answer this question: if `a2` contains 1200 and memory location 1200 contains 25, which value
is the address?

<details>
<summary>Show answers</summary>

1. A data register such as `d0`.
2. An address register such as `a0`.
3. A data register such as `d1`.
4. `a7`/`sp`.

The address is 1200. The value 25 is the data stored at that memory location.

</details>
