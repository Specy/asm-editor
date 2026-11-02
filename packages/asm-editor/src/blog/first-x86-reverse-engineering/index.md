## A browser workspace for executable inspection

ASM Editor lets you open an x86-64 executable, inspect its instructions, and debug it in your browser. Its built-in Ghidra decompiler also provides a C-like view of a function. You can follow a program's behavior through its code, registers, memory, flags, and terminal output.

This makes the workspace useful for exploring compiled programs and small reverse-engineering exercises. You can open the example at the end directly in the editor.

![An executable paused in the debugger, with its instructions, input bytes, registers, and processor flags visible.](/images/blog/first-x86-reverse-engineering/compare.webp)

## Import and inspect a program

Open [Projects](/projects), choose **Import**, and select an x86-64 Linux ELF executable. ELF is the file format used for Linux programs and libraries. ASM Editor recognizes the file's contents and creates an x86 project with it as the entry file.

The executable opens as a **Listing**, showing readable assembly instructions with their addresses and bytes. Disassembly decodes the program's machine instructions into this assembly view.

In an existing x86 project, upload an executable through the file explorer to inspect it.

## Read a function as Pseudocode

Ghidra's decompiler reconstructs function calls, conditions, and loops from machine code, displaying them as **Pseudocode** that resembles C. It runs in your browser, so you do not need to install Ghidra.

Place the cursor inside a function in the Listing, then choose **Decompile** in the controls below the editor. The Pseudocode opens beside the Listing. Moving the Listing cursor to another function updates the Pseudocode to show that function.

Related lines connect the Pseudocode to the assembly instructions that implement them. Select lines in either pane to highlight the corresponding lines in the other.

Pseudocode is an approximation made from the executable, not the original source. It is intended for reading and is not meant to compile. The [decompilation reference](/documentation/x86/executables#decompile) explains the view in more detail.

### Find a practice flag

Download the [practice executable](/downloads/blog/find-the-flag), then open [Projects](/projects), choose **Import**, and select the downloaded file. Choose **Decompile** in the controls below the editor. The example project at the end of this post opens the same executable without a download.

![Pseudocode showing the comparison with flag{read_the_pseudocode}, with a Terminal below displaying Flag accepted after that input.](/images/blog/first-x86-reverse-engineering/decompilation-flag.png)

The Pseudocode calls `strcmp` to compare the entered text with `flag{read_the_pseudocode}`. `strcmp` returns zero when the strings match. The `if (iVar1 == 0)` branch then prints `Flag accepted`, revealing which input to try.

Choose **Debug**, then **Run**. Enter `flag{read_the_pseudocode}` in the Terminal and press **Enter**. The message `Flag accepted` confirms that the discovered text passes the check.

The [C source](/downloads/blog/find-the-flag.c) is available for comparison or rebuilding.

## Debug without the original source

**Debug** loads the executable and advances through startup toward its detected `main`, or its entry point when no `main` is found. **Run** continues execution.

- **Breakpoints** pause execution before a chosen instruction. Click the margin beside an instruction in the Listing to place one.
- **Step** follows execution while registers, memory, flags, and execution history show the current state.
- **Undo** revisits recorded execution states.
- **Call stack** entries let you navigate the program's recorded calls.

The Listing is a view of the executable's machine code. Debug loads the executable itself.

## Connect instructions, data, and output

Search the Listing for a message, function, or instruction. Named locations and **Go to References** help you find the code that uses them. The editor supplies names for locations that have no original symbol name.

While paused, inspect the same program's bytes in Memory and its values in Registers. This keeps a branch, the data it reads, and the resulting terminal output visible within one workspace.

You can also patch an instruction while paused. The patch preview shows the replacement before applying it. A patch changes the running program's memory; the next Debug reloads the executable's file bytes. The [executable reference](/documentation/x86/executables#patching) explains patching and its Undo limits.

## Supported executables and libraries

The simulator accepts x86-64 Linux ELF executables, including static, position-independent, and supported dynamically linked programs. Dynamically linked programs can use the editor's bundled Linux libraries.

The [executable reference](/documentation/x86/executables) lists supported formats, libraries, startup behavior, and environment limits.

For programs you write yourself, ASM Editor also supports [C/C++ compilation](/blog/posts/c-cpp-to-assembly) and assembly projects in the same workspace.

## Try ASM Editor

The example project below contains the flag executable from above and two testcases: the flag prints `Flag accepted`, and any other input prints `Wrong flag`.

Open it with **Try ASM Editor**, then choose **Decompile** to read `main` as Pseudocode. Choose **Debug** and **Run**, enter a guess in the Terminal, and press **Enter**. Use Stop and Debug for a fresh run with another input, or choose **Test** to check both prepared cases.

To explore the debugger, set a breakpoint beside the `test eax, eax` instruction that follows the call to `strcmp` in the Listing, then run and enter a guess. When execution pauses there, `eax` holds the result of `strcmp`, zero only for the flag. Step to follow the `jne` to the message it chooses.

<p><a class="blog-try-button" href="/projects/share?project=N4IgZglgNgpgziAXKSA7AJgWgC4AsaZhQCGA5kqDKgMYD26Eq5iIARsXDAGwAsIANCDqpsVbEnAAGAGoBZAEqkAkgCEAggEU12nbu1K1ABVJr1O6irN6re7QHk1AJlsuAove0A5Ne7UAJLWptAE1dX20tF1NtcLCIl2cDWwARUJMXdKiAd11IkLUc2xVSZLzdAHE1bxcgqJVCqLLrXRso5rbYnT81ADEooIBVDuGdPpa2n07cpu0uDSm1ZIAHTTaZnTKmpKjSdbUAYVbtFQN111IjnUvjlszjbCiAamSARhdknkMhlNJ9qIBlNTbWwLfQVXT7fY8KJKQwAax2j3Wkh87y0e0yRT0ZSUSgxuHWkLGtkxej+bXJUViNn2pFwUQA0vtiXpaEpvmSJsCQW0eoYoOhyvMIftQbiOXo6etuZKJqTdAM7NJJAAtVbHWQymJZXYuAAqhyicApDSxdXkAFYABryOHFCYOx1Oh17XoAGQFQtij32KJSnwlOmMAE5CUCYWp5TE2m7HAAPJbBABWwUksbjcLdAHUE6xUNIeG6raQeJ4IJJHJ59haAF6sACePHrLkpplNsUqJPDbXqOnK6GkwXkzpHbXKmROo7apSuWqnPgnc-neUn89sbpaS9H0gha5cveO7k7WWFGQm5RVqBVNpr-k8qvKUAArv4VC90H5ZGpqABmeT14If08LJWAuMArXjRMAFtPDAX95FwahUHkMBWCzHollAlQaw-AApJNWCtbRWEfCBgnrWsGx4ZxXHQWR-gGXDkitGslCfWQIB4N5aPoxjmNY9iay0K0XmDVA0ODJ8rSAyRgitXDJBEgAOLtkm0L8CkWPRTQ2A5Fg0+Ioj8AZiGIDQEXUowVwhSQ4RVYJOz01wLISZJgyiRzDMdHg3I825nVkVxrhZA8nSCozZSdUVrm6XQdI6cKXFim5nXKRLbGS0xXT3HLcry-KCsKoripK0qyvKirKqq6qatqur6oaxqmualrWra9qOs6rrup63q+v6gbBqG4aRtGsbxomyapummbZrm+aFsWpblpW1a1vWjbNq27adt2obDFkQw-AANyWJRSEeLIlH+JQ4B6SR-hUnwIB6LIAn2AB6YMTlIJSNCULJ4o+msrQZN1Cg++srVkcHtGSON3KMJSoHrCAnvHPQuBgZIPtx3HcOoJRjuOWh1TUOxUA0PHcfrLMuFhtRiG7RYliyQxqeRuA0e0cc1J0LhWBxvGa3hgB2LhZBgF5cIgdAehgG7UAgG74SUnoVAGeQ9W6WRqCgJQ4yU9As1cb4PrjaRkgZ4NymCJ94ceKZkhFuNxayRw7YdqZ9g0e31C0E5DD1f3TEkVxRdJG6iPQNQoI+wKzHZ0gVSWZI04RnmVSgt1frAelbGOpMQ5+mAeBPXxFayf5ZD8J9DEkIvHiqAxqBVJRJDAC0w9AvQo7UGOYHjxKk8BpSwADqCVU4o6eBmA6juOgBHKzJGJnR0HkTxpEVqAuD8AAnanyhUMA4BfY4rWoOwNFH8fTEn6e-Fn2x55O-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-Pib-diTiN4GPFUIQ9XKAYMB-L3HPMAK-ZPNXCCXABPKCO5FUc7MABiA3eCOETPMAdAK0TwKANUTAivK-UXfXFnOMU3B3VUMZRQyQN3WCagR8KAVQ4IVATwEGGSOSBSCnF4XAN3aEQnAYPUAYWCeQAYC0VwZSJvRwZ8YgK0SIasGsGAUPWSLMAwN0fwgA5CfhEwJ8SZXAHCPwBSJpAoknAPcoZnWoQXc5fDKCTQyZEwPHS0PMTwC0VgLQQXPwZ8Ygg4C5PMAYAPKCJo1I9XMomQi0fDK8TnfwzCc5OCMon3aQRpf4C0OEHI6EQo3CIvNKco8oOMFEasTCEnS4qpK0XAW48vLPMY05DgnA6daY2gPAkPMPDQuEageYrMXAWPePNCIYPHC0Y6QUSYhYpYlQU5brFYy0MYp8G3JZW7Ohf4GvPIoIPHNIm0MAYIgCK0BEPHfAknQk+SYk0k7Q-o83bAN3L8PHdAKE7QFo7nQo+VGONQQXbZWSQYvwgIsYhZF4bAfpLuTxcodsXcWdGcWwSoZdcwHKRdKIfYAyZIRwIFYmPjaEOLOGEoKIBlStOUPcB4UFd1NoUIXtZlTSWwRU8YOIHQJcIdEtMoNVU9UFAdFwU4fcJMZUtcZIUdIWO9SMVUoKBYPEUEUEOGFtNoOdFQBkXQNhXGF9JcIlH9CEWbd4CYVoWID1NoLMTYGUlwQ9Y9PQZsQdLce07QD0nQfzS9NVWIDQPjc7OldQN7es69XQHoTEPjK9FoM03SOsnMh1UEeVPcaMh0BtRlcEVUzQaUPTFUqkCYV0T8B044eMrIMDDKMmPQMyScuoPcFQADXIXQTsnQbrGzZIeBPYPU50A8toMAaUz0uUPYWslQI0qcErNoOzdcpbUrXRNwHUU7f0+cfYPdIcsEKIGAY7FoHgOcAGPcfMqIVAU0HdWspbAkFsUUHYPcDCh0N0YELdPjNkTNOkerNcJclIa9TEastQJzd4QsDEJCk0qIPNHQWTSxJ4N86Eb0vC2MktTEK9KdWEC9ArVRPQFEKM1itwacfOSCtQOixwDLXQVIBmdoNcLcPjC0Z5VS5LUgD6dYLgfYWTXQXisCgS2wOwWTVoKdXYBYP4AtB8uMgM5zGsvQOihHOKas78tYPcR4XSnQKdB0WQLivQX7SinsE1YsobQ1KIBEas1gMIXsscCYT8203KUBWQDxQwc7NcXytwN0gqH8ZIOlLSKi7EPcAAXiqpAAAF86rBBqB94YBiBRAY5xBEBJBBAnxs82qYAOqkBuqQBUBiAoIYAJAehGB0AAACPAGAGaogMgAQEAEgJgJ8MgCalgK0JSLgFa9AeAZqiAJYbACAWgVACQFa2WCQAAfRurgHCJarupWrEH3nrAkDQCwHmsIBIHIEEE4GwFOqYAQGQEapAFEDgGwGoA4HgCQAAG1QBGAlgnxOq4bwBfrgAWriB0Abr5qbqlhOAA9aA6ADq6qQAABdQQGABMGAagdquwFG5GzqkAVwEQGAfeOa-ARa36xAAAHVQCHzIBmuIGoGoBgBOoGv5pWshuIH3iBtIHkBgFIAgEhvZpBuADBupqWFpvasVuVtVv3nVrBplrlsYFIEliglEXesQDhsppAC1p1oGotqtvhrttGvGokG-DFpOs5oWqWvIEasRtQCZvhvRrIGAFICfHgDgDJrtodrpoGoZuwBDpYFZtEA5vmu5rID5tQCzH3nOtICztIClv+oZNNqYD1pVvTqNqpppoTo3iVqrrVooGNrLvludretdtru1vro7utttsEHdq2pAEVqTB1uFtQFoHmo5qRpRvqvJrqqAA">Try ASM Editor →</a></p>
