# Named files in a playground

Existing assembly fences such as `riscv|playground|console` keep their single-file behavior.
For named files, put `file=` on the first playground fence and each companion fence. Adjacent
companions belong to one playground; prose or another `playground` fence ends the group.

````markdown
```c|playground|target=riscv|file=src/main.c|console|allow-open
#include "value.h"
#include <sim.h>
int main(void) {
    sim_print_int(VALUE);
    return 0;
}
```

```c|file=src/value.h
#define VALUE 42
```
````

For C/C++, `target=` selects `mips`, `riscv`, `riscv64`, or `x86`; the fence's first entry selects
code highlighting. The C/C++ file extension determines which compiler language is used. Assembly
playgrounds use their usual architecture name and can also carry named companion files.

The first file is the entry by default. Set `entry=path/to/main.s` on the first fence to choose
another included file. Paths are relative to the playground root and must be unique. Attach any
`testcase` fence after the last file.

The embedded editor shows file tabs and uses the workspace's buttons: **Compile** on a C/C++ file,
then **Build** on its Generated assembly, followed by **Run**. Optimization defaults to **-O0**.
Generated assembly offers **Recompile** when source/header or assembly edits require it.
Compilation uses the existing
Compiler Explorer service and needs an internet connection. It compiles one selected source unit
with its local headers, as in the project editor. Source/header edits require recompilation.
**Open in editor** preserves all files, their names, the entry, testcases, and compilation records.

Embed URLs accept a compressed `program` containing `{ files, entry, compilations? }`, using the
Project's `{ encoding: "plain", content: "..." }` file records. `language` still chooses the CPU
target. Legacy `code` URLs remain supported. The `playgroundProgram.ts` codec validates the payload
and preserves compilation provenance when generating another embed URL.

The content verifier builds named assembly programs offline. To also compile and run C/C++ course
examples, run `ASM_EDITOR_CONTENT_COMPILE=1 npx vitest run src/lib/content/content.test.ts` with
Compiler Explorer reachable. Parser, renderer, and compilation lifecycle tests remain offline,
using recorded compiler responses.
