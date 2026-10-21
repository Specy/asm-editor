## A browser workspace for executable inspection

ASM Editor lets you open an x86-64 executable, inspect its instructions, and debug it in your browser. You can follow a program's behavior through its code, registers, memory, flags, and terminal output, even when its original source is unavailable.

This makes the workspace useful for exploring compiled programs, small reverse-engineering exercises, and executable examples used in a class. You can open the example at the end directly in the editor.

![An executable paused in the debugger, with its instructions, input bytes, registers, and processor flags visible.](/images/blog/first-x86-reverse-engineering/compare.webp)

## Import and inspect a program

Open [Projects](/projects), choose **Import**, and select an x86-64 Linux ELF executable. ELF is the file format used for Linux programs and libraries. ASM Editor recognizes the file's contents and creates an x86 project with it as the entry file.

The executable opens as a **Listing**: readable assembly instructions with their addresses and bytes. Disassembly decodes the program's machine instructions into this assembly view.

In an existing x86 project, upload an executable through the file explorer and accept the offer to create a program for it. A filename extension is not required.

## Debug without the original source

**Build** loads the executable and advances through startup toward its detected `main`, or its entry point when no `main` is found. **Run** continues execution; text input and output use the Terminal.

- **Breakpoints** pause Run before a chosen instruction. Click the margin beside an instruction in the Listing to place one.
- **Step** follows execution while registers, memory, flags, and execution history show the current state.
- **Undo** revisits recorded execution states. Some operations, such as consuming terminal input, form boundaries that Undo cannot cross.
- **Call stack** entries let you navigate the program's recorded calls.

The Listing is a view of the executable's machine code. Build loads the executable itself, so you can debug a program without recreating it from assembly text.

## Connect instructions, data, and output

Search the Listing for a message, function, or instruction. Named locations and **Go to References** help you find the code that uses them. The editor supplies names for locations that have no original symbol name.

While paused, inspect the same program's bytes in Memory and its values in Registers. This keeps a branch, the data it reads, and the resulting terminal output visible within one workspace.

You can also patch an instruction while paused. The patch preview shows the replacement before applying it. A patch changes the running program's memory; the next Build reloads the executable's file bytes. The [executable reference](/documentation/x86/executables#patching) explains patching and its Undo limits.

## Supported executables and libraries

The simulator accepts x86-64 Linux ELF executables, including static, position-independent, and supported dynamically linked programs. Dynamically linked programs can use the editor's bundled Linux libraries, which are downloaded when needed.

The simulated environment supplies terminal input, output, and project files. Its available instructions and system calls determine which programs run. The [executable reference](/documentation/x86/executables) lists supported formats, libraries, startup behavior, and environment limits.

For programs you write yourself, ASM Editor also supports [C/C++ compilation](/blog/posts/c-cpp-to-assembly) and assembly projects in the same workspace.

## Try ASM Editor

The example project below contains a small executable and two testcases. The program asks for a letter: `A` prints `Accepted`, while `B` prints `Try again`.

Open it with **Try ASM Editor**, wait for its **Listing**, then choose **Build** and **Run**. Enter `A` in the Terminal and press **Enter**. Use Stop and Build for a fresh run with another input, or choose **Test** to check both prepared cases.

To explore the debugger, set a breakpoint beside the `cmp` instruction in the Listing before running. You can then inspect the input, Step through the decision, and continue to its output.

You can also download the [executable](/downloads/blog/first-branch) to try Import yourself. Its [assembly source](/downloads/blog/first-branch.s) is available for comparison or rebuilding outside the editor.

<p><a class="blog-try-button" href="/projects/share?project=N4IgZglgNgpgziAXKSAnOAXAtAI1QQwDsBjACyVBhIHsATCQgcyRB3zhgDYAWEAGhDFqhDFQwswABgBqAWQBKjAJIAhAIIBFNdp27tStQAVGa9bpVm9lvdoCijCDae3tAeW0AxNS9MB3NQDidro+TmGhTlo2AOreTioAmpphyWFR2gCqehE2GulW1joqjmEBBimF5lV6JmEAwpU6SjnadeVOSrXhKRFBTV02ELItam2++Sl6sZMTOhkw0pIAWmpJk+sbm5MjW7t7+weHR8cnp2fnF5dX1ze3d-cPj0-PL69v7x+fX98-v3--AMBQOBINBYPBEMhUOhMNhcPhCMRSORKNRaPRGMxWOxONxePxBMJROJJNJZPJFMpVOpNNpdPpDMZTJ+ABlGNYAG6+UIqJQAKwAKgANDkAEX8agArowABy6QwqAUACTUsjAAE5+cKAPRKiWS0h6BVJdUy+Ry7weSSigDWEAAcvbaBlDK1OHUuq44LIAMpKSQARkkGgtLOoACldJK4q1taltDKPJLxboAB7a3yJ5nZnO5vP5guFovFkulsvliuVqvVmu1uv1huNpvNluttvtjudrvdnu9vv9geDofDkdElTzIUqKBKAL2HABRa0BcAT1cEHHxEINsYCWitFI+Gi3AA0hpova+UtJ8tohpj+98loZWALYdRWFas0DrYJTUjF-9iVAYdH8IYdkmcNZk0CxbHAlI2ScExDAAvZXUQtQlhQ3ZFEiFR7Vgg4Ml-XQTEwuCwhWdCICwrZiHSSxQOGA4wHonQogI-ZGC6Bi1DAg4cGqNR-G4JiDgCC8fQAL2kDAfQFaQAxZABbOViCVcMORwa81CVFRlxwAAmANfFoDx1SgHAlK0XcAFZJNoAzpGXQIPD5BJHJMhcbR08MoFodSbKFIyoGIABme1SCWAysmIJTFk3KAwCWaIbO83Tl0PGzJCFULfLC6Q4FoUxSHc+0QqVeQoCWMyMCve1JN3WgoBctyPKXaQbSC6RJRWFQwCC8NJOIAN1XsgIPGXIqVAwXcoGjMyqvGyQEiiFlCHtGytPkEqTElML5Em8bHDqOz8CVe1JE3baEl29ruCKqVYvVG0EiFbbRhsiAwtkMkBN0fI1jCCwelKdp9kaTYlHyCI6nWRgoNGFISkOBH1jqbymj0Yi9D4mw2mAnQPAJrZyIqP8zmoMHdACdkgfyOBdCp8xidafIfrOG06hGOpIyOVHJhUCJ3zOFQ7TCBDDlJsIAF4QAAXzlgQxFQZcJAgdBsDwIgyH4EAOAwDAGEYBBkEVwRUBgfBRCK8REEkARJQAB1oK2YBtpB7ZAQh8CUmAWA8dXMAAAi1khyAEKAiEYSV8EYP3EBAIUZU4XXaHgYhUAgR3DeEFhddETBiHYeAkAAbVATB8FQQ2mHkGAHEwGB0AoM2YFTR2YGIa264b0Rm9NgRK+ro3ZBgJTqBVsuAF0lfbzvrdH8fJ8QUuZ5ABhHclW3S5ANQQDXtuO67t3XC3zfbZAAVlw7oP8CD2ADabxAg7UYhiBgbO3YAHUIXXvd9lgr937ZxfvLPgFcMBVxrowHuEBG792AK3Oex9aCwPgSbRBg9IHDyYIvCeqsV4H2QQvMe+Dp4CA3lvMuIAVD71nkfa2p8MDnxYFfG+d8H592fgKFWt9GD4AYD-P+Pt44gDrnyeeQdaFyzXhAWgLAAD6Ci4AHgtko+WQA">Try ASM Editor →</a></p>
