## What directives are

Directives are not executed by the processor: they tell the assembler where to put code and data, what bytes to emit, which names stand for which values, and when to expand a macro. The list is NASM's own, so it is what this editor accepts rather than what another assembler might.

## Directives {#directives}

Directives tell the assembler what to do. They are not instructions and the processor never sees them.

## Data and space {#data}

These live in the instruction table and behave like directives: they put bytes in the output, or reserve room for them.

## The preprocessor {#preprocessor}

The preprocessor runs over the text before the assembler reads it, so it can define names, repeat blocks and include files, and knows nothing about registers or instructions.

## Prefixes and operand sizes {#prefixes}

Words that go in front of an instruction or an operand rather than standing on their own.

## Everything else {#everything-else}

The rest of what NASM accepts, from its own tables. These are here so the list is complete; the [NASM manual](https://www.nasm.us/docs.php) documents them.

{directives}

{preprocessor}
