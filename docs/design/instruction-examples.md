# Focused instruction examples

This design records the approved shared support for authored instruction content, with MIPS
and RISC-V as the first consumers. See [ADR 0038](../adr/0038-instruction-examples-are-authored-in-the-editor.md)
for the content ownership decision.

## Agreed scope

- Rewrite the interactive instruction examples for MIPS and RISC-V only. The shared model must
  also accommodate M68K, x86 and Z80 without rewriting their examples in this pass.
- Focus each program on its named instruction, using only the supporting instructions and
  directives needed to make its behavior observable.
- Put all register and memory setup in the source. An example must work when copied into a new
  Project with the same Target, without hidden starting values.
- Show useful variations and quirks within the same example where they fit its focus.
- Keep faulting variations commented out, with instructions for enabling them.
- Prepare for richer instruction descriptions, but do not write those descriptions now.

## Behavior before this change

The MIPS and RISC-V language data modules assign each Core's syntax sample to
`interactiveExample.code`. An instruction page selects the first form's sample, so a branch
can reference a label that is never defined and a memory instruction can use an address that
is never initialized. The installed Cores currently describe 224 MIPS mnemonics and 263
RISC-V mnemonics, including pseudo-instructions and RV64 instructions.

The RISC-V instruction page always requests the `RISC-V` Target, even for an RV64-only
instruction. The documentation entries separately expose the syntax samples to the Workbench
and search. These are useful descriptions of operand forms, but they are not complete runnable
programs.

Relevant sources:

- `src/lib/languages/MIPS/MIPS-documentation.ts`
- `src/lib/languages/RISC-V/RISC-V-documentation.ts`
- `src/lib/documentation/entries.ts`
- `src/lib/documentation/mips/mips.ts`
- `src/lib/documentation/riscv/riscv.ts`
- `src/routes/documentation/{mips,risc-v}/instruction/[instructionName]/+page.svelte`
- `src/components/documentation/site/ClientOnly.svelte`
- [ADR 0025](../adr/0025-documentation-is-a-list-of-entries.md)

## Authoring model

Keep authored content in the editor repository, keyed by documentation language and mnemonic.
The Core remains the source of supported instructions, operand forms and existing descriptions.
The authored layer supplies a runnable example and, in the future, optional richer prose.

Use one shared content shape with no MIPS- or RISC-V-specific fields:

```ts
type InstructionContent = {
    /** Optional authored Markdown; absent throughout this rewrite. */
    description?: string
    example?: InstructionExample
}

type InstructionExample = {
    /** The executable Target, distinct from the documentation language. */
    target: AvailableLanguages
    code: string
    presentation?: {
        showMemory?: boolean
        showConsole?: boolean
        showPc?: boolean
        showFlags?: boolean
        initialRegisterFile?: string
        initialRegisterFormat?: RegisterFormat
    }
}
```

`AvailableLanguages` is the existing Target union, covering M68K, MIPS, x86, RV32, RV64 and Z80.
Presentation choices only select existing panels; they never initialize machine state. The
example chooses the floating-point or control-register file and a supported Format when that is
where its result is visible. RV64-only programs explicitly request `RISC-V-64`; ordinary RISC-V programs use RV32
unless their demonstration requires RV64 behavior.

Store programs as ordinary assembly files under each language's documentation directory, with
a typed registry for their Target and presentation. For example,
`src/lib/documentation/mips/instructions/add.asm` is registered by mnemonic in the MIPS
instruction-content module. Import the files as text through the existing Vite raw-import
mechanism. This keeps code editable and copyable without hiding it in a generator. Future
Markdown can be imported alongside it without changing the example format.

The shared types and resolution rules belong under `src/lib/documentation/instructions/`.
Architecture modules register their own content; the shared resolver does not import all Cores
or encode their instruction semantics. Adding another architecture later means providing its
content registry and connecting it to its instruction entries.

## Integration

Attach the resolved authored content to the existing instruction Documentation entry. The
standalone instruction page, the Workbench's Documentation panel and the search index consume
that same content, retaining existing ids, routes and operand-form samples.

- The instruction page starts its Interactive editor with the authored program, Target and
  presentation. Its "Try in the editor" action preserves the edited source and the same Target.
- Prerendered pages carry the complete program in a static `<pre><code>` block, readable without
  JavaScript and crawlable as HTML. Hydration replaces that block with the Interactive editor;
  the code stays visible while the client component and Emulator load.
- Static source uses the lecture tokenizer and editor colour palette, without a caption. Shared
  layout rules give both states a 20rem minimum editor height. The highlighted preview spans the
  page width and scrolls within 20rem so long programs do not expand the loading state. The complete
  source remains in the HTML. Register/memory columns appear with the interactive editor and wrap
  responsively. The preview's 16px code and line-number gutter match the editor's typography.
- The same code-block stylesheet also serves lecture listings and Markdown previews. Callers
  configure line numbers through the `lineNumbers` prop on `MarkdownRenderer`, `MarkdownEditor`
  and `CodeSample`; there is no reader-facing toggle. Ordinary listings grow to their content
  and scroll when long, while interactive lecture previews preserve their embed dimensions.
  Gutters are compact by default. The `gutterSpacing` prop reserves the editor's glyph and
  decoration margins; instruction and lecture editor placeholders enable it to match Monaco.
- The Documentation panel shows the program as a code sample; it does not create another
  running Emulator inside the Workbench.
- Search includes the authored program in the entry's existing lower-weight code field, along
  with the existing syntax samples. Future authored descriptions join the searchable prose and
  render consistently on the page and in the panel.
- With no authored description, all current Core descriptions remain available. With authored
  prose later, it becomes the main explanation while operand-form descriptions remain attached
  to their forms; search, summaries and page metadata follow the same resolution rule.
- Other architectures retain their current content and execution paths until they adopt the
  authored layer. A missing MIPS or RISC-V program must not silently fall back to an incomplete
  syntax sample presented as runnable content.

## Example conventions

Write one program per mnemonic, with a small number of labeled cases only where they reveal
meaningfully different behavior. Cover basic instructions, pseudo-instructions, floating-point
and control-register instructions, and RV64-only mnemonics. Full coverage means a purposeful
example for every mnemonic; it does not mean repeating every interchangeable operand spelling.

Comments identify the setup, the instruction being demonstrated, and the register, memory
location, flag or output to inspect. Give concrete expected values. Prefer inspecting machine
state to adding printing services solely to display arithmetic results; use the Terminal when
the instruction's purpose involves it. Explain essential support instructions briefly where
they occur, without turning the program into a lesson on them.

For a branch, demonstrate the taken and untaken conditions without an uncontrolled loop. For
memory, define aligned data and initialize a valid address. For an instruction with implicit
state, initialize that state explicitly and make its result accessible. Show signedness,
extension, truncation or other quirks when they materially help explain the named instruction.

A faulting variation stays in a clearly marked commented block, placed before normal completion
so enabling it actually executes it. State the expected stop or error. When the named
instruction's primary purpose is itself a trap or a stop, the example identifies that expected
outcome; it must not mistake the intentional outcome for a broken program. Supporting exit code
appears only when required for a finite, predictable demonstration.

The shipped RISC-V Core waits indefinitely on `wfi`, including when an instruction limit is
set. There is no interrupt source in the standalone example. Its `wfi` line is therefore an
explicitly commented opt-in variation: the default run completes, and the comment gives the
register state to inspect if the reader enables the wait and explains how to reset it. This is
the only exception to requiring the named instruction in the default executable source.

## Validation and completion

Check that registry keys name supported mnemonics and every MIPS/RISC-V mnemonic has an authored
program. Validate Target selection independently of presentation. Do not claim coverage from a
generic initialized version of the Core's first syntax sample.

Build every default program and run it with an instruction limit against the same Cores and
adapters the app ships. Assert meaningful results against the expected values stated in the
example, including relevant floating-point and control-register state. Explicitly classify
intentional stops. Verify selected enabled fault blocks separately; the default run remains
free of incidental faults. Verification expectations belong in tests and are not hidden setup
or a new learner-facing test workflow.

Use the repository's existing documentation integrity checks and Svelte checking for the shared
integration. Browser-check representative arithmetic, branch, memory, floating-point, control
register and RV64 pages, navigation between examples, and "Try in the editor" Target/source
preservation at desktop and narrow widths.

Review the examples from the perspective of a beginner who knows how to Build, Step and inspect
registers, but has not learned unrelated instructions. Check that the expected effects are
visible and the support code does not obscure the named instruction. If the shipped emulator
prevents a correct example, report a concrete reproduction rather than changing its behavior
as part of the documentation rewrite.

The rewrite is complete when all MIPS/RISC-V mnemonics have focused, validated examples and
the shared content path is connected to the pages, panel and search. Rich descriptions and
example rewrites for the other architectures remain deferred.

## Implementation validation

The authored registries cover all 224 MIPS and 263 RISC-V mnemonics. The adapter sweep builds
and executes every default program serially on its declared Target and checks the separately
authored register, floating-point, flag, memory and output expectations. The marked MIPS
`add` and `addi` overflow variations also produce their expected errors. An isolated, bounded
probe of enabled `wfi` confirms that simulation remains unsettled with `t0=9` and `t1=0`.

The shared-content and page/panel integration tests, existing documentation integrity checks,
Register panel DOM tests, and MIPS/RISC-V search golden queries pass. Svelte checking reports
zero errors and 31 warnings; scoped ESLint and the production static build pass.
The final beginner reread accepts the revised corpus.

SSR integration tests check the code-block fallback for MIPS and RV64 examples. Inspecting the
built HTML confirms that all 487 instruction pages contain their complete authored program in
a `<pre><code>` block, independently of the serialized hydration data.

Real-browser verification remains unavailable in this sandbox: local sockets and Chromium
startup are blocked. The DOM and server-rendering checks validate the shared integration,
but do not establish desktop/narrow layout or live navigation and sharing behavior.
